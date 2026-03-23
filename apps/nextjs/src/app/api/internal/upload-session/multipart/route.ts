import { z } from "zod";

import { and, eq, isNull, or } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys } from "@silo-storage/db/schema";

import { env } from "@/env";

const schema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  fileKeyId: z.string().min(1),
  uploadId: z.string().min(1),
  multipartUploadId: z.string().min(1),
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

  const { projectId, environmentId, fileKeyId, uploadId, multipartUploadId } =
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
      uploadSessionId: true,
      uploadSessionMultipartId: true,
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

  if (existing.uploadSessionId !== uploadId) {
    return new Response(JSON.stringify({ error: "Upload session mismatch" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    existing.uploadSessionMultipartId &&
    existing.uploadSessionMultipartId !== multipartUploadId
  ) {
    return new Response(
      JSON.stringify({
        error: "Multipart upload already registered for session",
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const [updated] = await db
    .update(fileKeys)
    .set({
      uploadSessionMultipartId: multipartUploadId,
      uploadSessionUpdatedAt: new Date(),
    })
    .where(
      and(
        eq(fileKeys.id, fileKeyId),
        eq(fileKeys.uploadSessionId, uploadId),
        or(
          isNull(fileKeys.uploadSessionMultipartId),
          eq(fileKeys.uploadSessionMultipartId, multipartUploadId),
        ),
      ),
    )
    .returning({ id: fileKeys.id });

  if (!updated) {
    return new Response(
      JSON.stringify({ error: "Multipart registration conflict" }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
