import { z } from "zod";

import { and, eq, inArray, isNotNull, lte } from "@silo-storage/db";
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
    const candidates = await db
      .select({ fileId: fileKeys.fileId })
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
      return new Response(
        JSON.stringify({ deletedCount: 0, deletedFileIds: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const deleted = await db
      .delete(files)
      .where(inArray(files.id, deletableFileIds))
      .returning({ id: files.id });

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
