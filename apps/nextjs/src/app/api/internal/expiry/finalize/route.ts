import { z } from "zod";

import { and, eq, inArray, isNotNull, lte } from "@silo-storage/db";
import { syncEnvironmentStorageSnapshots } from "@silo-storage/api/services";
import { db } from "@silo-storage/db/client";
import { fileKeys, files } from "@silo-storage/db/schema";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";

const bodySchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1).max(1000),
});

export async function POST(request: Request) {
  if (!isCallbackAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request body",
        details: parsed.error.issues,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const now = new Date();

  try {
    const { deleted, deletedFiles } = await db.transaction(async (tx) => {
      const candidates = await tx
        .select({
          fileKeyId: fileKeys.id,
          fileId: fileKeys.fileId,
        })
        .from(fileKeys)
        .where(
          and(
            inArray(fileKeys.fileId, parsed.data.fileIds),
            eq(fileKeys.status, "completed"),
            isNotNull(fileKeys.fileId),
            isNotNull(fileKeys.expiresAt),
            lte(fileKeys.expiresAt, now),
          ),
        );

      const deletableFileIds = [
        ...new Set(
          candidates.map((row) => row.fileId).filter((id): id is string => !!id),
        ),
      ];

      if (deletableFileIds.length === 0) {
        return {
          deleted: [] as { id: string }[],
          deletedFiles: [] as {
            id: string;
            projectId: string;
            environmentId: string;
          }[],
        };
      }

      const deletedFiles = await tx
        .select({
          id: files.id,
          projectId: files.projectId,
          environmentId: files.environmentId,
        })
        .from(files)
        .where(inArray(files.id, deletableFileIds));

      const expiredFileKeyIds = candidates.map((row) => row.fileKeyId);
      if (expiredFileKeyIds.length > 0) {
        await tx
          .update(fileKeys)
          .set({
            status: "deleted",
            deletedAt: now,
            fileId: null,
          })
          .where(inArray(fileKeys.id, expiredFileKeyIds));
      }

      const deleted = await tx
        .delete(files)
        .where(inArray(files.id, deletableFileIds))
        .returning({ id: files.id });

      return { deleted, deletedFiles };
    });

    await syncEnvironmentStorageSnapshots(
      db,
      deletedFiles.map((file) => ({
        projectId: file.projectId,
        environmentId: file.environmentId,
      })),
    );

    return new Response(
      JSON.stringify({
        deletedCount: deleted.length,
        deletedFileIds: deleted.map((row) => row.id),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error finalizing expired files:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
