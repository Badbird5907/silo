import { z } from "zod";

import { and, asc, eq, isNotNull, lte } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys, files } from "@silo-storage/db/schema";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";

const bodySchema = z.object({
  limit: z.number().int().positive().max(500).default(100).optional(),
});

export async function POST(request: Request) {
  if (!isCallbackAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
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
  const limit = parsed.data.limit ?? 100;

  try {
    const expired = await db
      .select({
        fileKeyId: fileKeys.id,
        fileId: fileKeys.fileId,
        projectId: fileKeys.projectId,
        environmentId: fileKeys.environmentId,
        accessKey: fileKeys.accessKey,
        expiresAt: fileKeys.expiresAt,
        storageKey: files.storageKey,
      })
      .from(fileKeys)
      .innerJoin(files, eq(fileKeys.fileId, files.id))
      .where(
        and(
          eq(fileKeys.status, "completed"),
          isNotNull(fileKeys.fileId),
          isNotNull(fileKeys.expiresAt),
          lte(fileKeys.expiresAt, now),
        ),
      )
      .orderBy(asc(fileKeys.expiresAt), asc(fileKeys.id))
      .limit(limit);

    return new Response(
      JSON.stringify({
        items: expired.map((item) => ({
          fileKeyId: item.fileKeyId,
          fileId: item.fileId,
          projectId: item.projectId,
          environmentId: item.environmentId,
          accessKey: item.accessKey,
          expiresAt: item.expiresAt,
          storageKey: item.storageKey,
          adapterKey: item.storageKey,
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error listing expired files:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
