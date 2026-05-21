import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys } from "@silo-storage/db/schema";
import { asyncWaitForMessage } from "@silo-storage/redis";
import { normalizeFileKeyMetadata } from "@silo-storage/shared";

import { env } from "@/env";
import {
  authenticateRequest,
  jsonError,
  validateEnvironmentAccess,
  validateProjectAccess,
} from "@/lib/api-key-middleware";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSseFrame(
  event: "connected" | "upload" | "keepalive" | "error",
  payload: unknown,
): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`; // ending \n\n is required for SSE to work
}

export async function GET(request: Request) {
  if (!env.DEV_UPLOAD_SSE_ENABLED) {
    return jsonError(
      "Service Unavailable",
      "SSE upload events are disabled.",
      503,
    );
  }

  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const environmentId = url.searchParams.get("environmentId");
  const fileKeyId = url.searchParams.get("fileKeyId");

  if (!projectId || !environmentId || !fileKeyId) {
    return jsonError(
      "Bad Request",
      "projectId, environmentId, and fileKeyId are required query parameters.",
      400,
    );
  }

  const project = await validateProjectAccess(authResult, projectId);
  if (project instanceof Response) return project;

  const environment = await validateEnvironmentAccess(environmentId, projectId);
  if (environment instanceof Response) return environment;
  if (environment.type !== "development") {
    return jsonError(
      "Not Found",
      "SSE upload events are only available for development environments.",
      404,
    );
  }

  const fileKey = await db.query.fileKeys.findFirst({
    where: and(
      eq(fileKeys.id, fileKeyId),
      eq(fileKeys.projectId, projectId),
      eq(fileKeys.environmentId, environmentId),
    ),
    with: { file: true },
  });

  const channel = `upload:${fileKeyId}`;
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
              fileKeyId,
              status: fileKey?.status ?? "pending",
            }),
          ),
        );

        if (fileKey?.status === "deleted") {
          close();
          return;
        }

        // upload already complete/failed
        if (fileKey?.status === "completed" || fileKey?.status === "failed") {
          controller.enqueue(
            encoder.encode(
              toSseFrame("upload", {
                type:
                  fileKey.status === "completed"
                    ? "upload.completed"
                    : "upload.failed",
                data: {
                  fileKeyId: fileKey.id,
                  accessKey: fileKey.accessKey,
                  metadata: normalizeFileKeyMetadata(fileKey.metadata),
                  status: fileKey.status,
                  file: fileKey.file
                    ? {
                        id: fileKey.file.id,
                        hash: fileKey.file.hash,
                        mimeType: fileKey.file.mimeType,
                        size: fileKey.file.size,
                      }
                    : null,
                },
              }),
            ),
          );
          close();
          return;
        }

        // listen for upload completion/failure
        while (Date.now() - startedAt < 120000) {
          // 2 mins
          if (request.signal.aborted) {
            close();
            break;
          }

          try {
            const message = await asyncWaitForMessage(channel, 25000);
            const payload = JSON.parse(message.data) as { type?: string };
            controller.enqueue(encoder.encode(toSseFrame("upload", payload)));

            if (
              payload.type === "upload.completed" ||
              payload.type === "upload.failed"
            ) {
              close();
              return;
            }
          } catch (error) {
            const err =
              error instanceof Error
                ? error.message
                : "Unknown SSE stream error";
            if (err.includes("Timeout waiting for message")) {
              controller.enqueue(
                encoder.encode(toSseFrame("keepalive", { ts: Date.now() })),
              );
              continue;
            }

            controller.enqueue(
              encoder.encode(toSseFrame("error", { message: err })),
            );
            close();
            return;
          }
        }

        close();
      })();
    },
    cancel() {
      // no-op
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
