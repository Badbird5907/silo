import { normalizeFileKeyMetadata } from "@silo-storage/shared";
import type { UploadEventEnvelope } from "@silo-storage/shared";

import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys } from "@silo-storage/db/schema";
import { asyncWaitForMessage } from "@silo-storage/redis";
import { signWebhookPayload } from "@silo-storage/api/services";

import { env } from "@/env";

function toSseFrame(event: "connected" | "chunk" | "keepalive" | "error", payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function toDevChunk(event: UploadEventEnvelope) {
  const payload = JSON.stringify(event.data);
  const { signature } = await signWebhookPayload(payload, env.CALLBACK_SECRET);

  return {
    payload,
    signature,
    hook: event.type,
  };
}

export async function createDevUploadEventStream(request: Request, input: {
  projectId: string;
  environmentId: string;
  fileKeyId: string;
}) {
  const fileKey = await db.query.fileKeys.findFirst({
    where: and(
      eq(fileKeys.id, input.fileKeyId),
      eq(fileKeys.projectId, input.projectId),
      eq(fileKeys.environmentId, input.environmentId),
    ),
    with: { file: true },
  });

  const channel = `upload:${input.fileKeyId}`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const startedAt = Date.now();

      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      void (async () => {
        controller.enqueue(
          encoder.encode(
            toSseFrame("connected", {
              channel,
              fileKeyId: input.fileKeyId,
              status: fileKey?.status ?? "pending",
            }),
          ),
        );

        if (fileKey?.status === "deleted") {
          close();
          return;
        }

        if (fileKey?.status === "completed" || fileKey?.status === "failed") {
          const terminalEvent: UploadEventEnvelope = fileKey.status === "completed"
            ? {
                id: `upload.completed:${fileKey.id}`,
                type: "upload.completed",
                version: 1,
                occurredAt: new Date().toISOString(),
                data: {
                  environmentId: fileKey.environmentId,
                  projectId: fileKey.projectId,
                  fileKeyId: fileKey.id,
                  accessKey: fileKey.accessKey,
                  fileId: fileKey.file?.id ?? "",
                  fileName: fileKey.fileName,
                  hash: fileKey.file?.hash ?? null,
                  mimeType: fileKey.file?.mimeType ?? "application/octet-stream",
                  size: fileKey.file?.size ?? 0,
                  metadata: normalizeFileKeyMetadata(fileKey.metadata),
                },
              }
            : {
                id: `upload.failed:${fileKey.id}`,
                type: "upload.failed",
                version: 1,
                occurredAt: new Date().toISOString(),
                data: {
                  environmentId: fileKey.environmentId,
                  projectId: fileKey.projectId,
                  fileKeyId: fileKey.id,
                  metadata: normalizeFileKeyMetadata(fileKey.metadata),
                  error: "Upload failed",
                },
              };

          const chunk = await toDevChunk(terminalEvent);
          controller.enqueue(encoder.encode(toSseFrame("chunk", chunk)));
          close();
          return;
        }

        while (Date.now() - startedAt < 120000) {
          if (request.signal.aborted) {
            close();
            break;
          }

          try {
            const message = await asyncWaitForMessage(channel, 25000);
            const event = JSON.parse(message.data) as UploadEventEnvelope;
            const chunk = await toDevChunk(event);
            controller.enqueue(encoder.encode(toSseFrame("chunk", chunk)));

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (event.type === "upload.completed" || event.type === "upload.failed") {
              close();
              return;
            }
          } catch (error) {
            const err =
              error instanceof Error ? error.message : "Unknown SSE stream error";

            if (err.includes("Timeout waiting for message")) {
              controller.enqueue(
                encoder.encode(toSseFrame("keepalive", { ts: Date.now() })),
              );
              continue;
            }

            controller.enqueue(encoder.encode(toSseFrame("error", { message: err })));
            close();
            return;
          }
        }

        close();
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
