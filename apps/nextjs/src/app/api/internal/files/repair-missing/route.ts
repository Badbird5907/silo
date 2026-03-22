import { z } from "zod";

import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys, files } from "@silo-storage/db/schema";

import { env } from "@/env";

const bodySchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  fileKeyId: z.string().min(1),
  fileId: z.string().min(1),
  accessKey: z.string().min(1),
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

  const input = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const fileKey = await tx.query.fileKeys.findFirst({
        where: and(
          eq(fileKeys.id, input.fileKeyId),
          eq(fileKeys.projectId, input.projectId),
          eq(fileKeys.environmentId, input.environmentId),
        ),
      });

      if (!fileKey) {
        return { repaired: false, reason: "file_key_not_found" as const };
      }

      if (fileKey.status === "failed" && !fileKey.fileId) {
        return { repaired: false, reason: "already_repaired" as const };
      }

      if (
        fileKey.status !== "completed" ||
        !fileKey.fileId ||
        fileKey.fileId !== input.fileId
      ) {
        return { repaired: false, reason: "not_completed" as const };
      }

      await tx
        .update(fileKeys)
        .set({
          status: "failed",
          uploadFailedAt: new Date(),
          fileId: null,
        })
        .where(eq(fileKeys.id, fileKey.id));

      await tx.delete(files).where(eq(files.id, input.fileId));

      return { repaired: true, reason: "updated" as const };
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        fileKeyId: input.fileKeyId,
        fileId: input.fileId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error repairing missing file object", {
      fileKeyId: input.fileKeyId,
      fileId: input.fileId,
      accessKey: input.accessKey,
      adapterKey: input.adapterKey,
      error,
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
