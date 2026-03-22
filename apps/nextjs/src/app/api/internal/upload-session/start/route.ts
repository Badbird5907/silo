import { z } from "zod";

import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys } from "@silo-storage/db/schema";

import { env } from "@/env";

const schema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  fileKeyId: z.string().min(1),
  uploadId: z.string().min(1),
  adapterKey: z.string().min(1),
});

export async function POST(request: Request) {
  const header = request.headers.get("Authorization");
  if (
    !header?.startsWith("Bearer ") ||
    header.split(" ")[1] !== env.CALLBACK_SECRET
  ) {
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

  const parsed = schema.safeParse(body);
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

  const { projectId, environmentId, fileKeyId, uploadId, adapterKey } =
    parsed.data;

  const existing = await db.query.fileKeys.findFirst({
    where: and(
      eq(fileKeys.id, fileKeyId),
      eq(fileKeys.projectId, projectId),
      eq(fileKeys.environmentId, environmentId),
    ),
    columns: {
      id: true,
      status: true,
      callbackMetadata: true,
    },
  });

  if (!existing) {
    return new Response(JSON.stringify({ error: "File key not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (existing.status !== "pending") {
    return new Response(JSON.stringify({ success: true, skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const existingMeta =
    existing.callbackMetadata &&
    typeof existing.callbackMetadata === "object" &&
    !Array.isArray(existing.callbackMetadata)
      ? (existing.callbackMetadata as Record<string, unknown>)
      : {};

  const nextMetadata: Record<string, unknown> = {
    ...existingMeta,
    uploadSession: {
      uploadId,
      adapterKey,
      updatedAt: new Date().toISOString(),
    },
  };

  await db
    .update(fileKeys)
    .set({ callbackMetadata: nextMetadata })
    .where(eq(fileKeys.id, fileKeyId));

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
