import { z } from "zod";

import {
  markUploadAsFailed,
  UploadFailureError,
} from "@silo-storage/api/services";
import { and, asc, eq, sql } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys, files, projects } from "@silo-storage/db/schema";

import { env } from "@/env";

const uploadSessionSchema = z.object({
  uploadId: z.string().min(1),
  adapterKey: z.string().min(1).optional(),
  updatedAt: z.string().optional(),
});

const bodySchema = z.object({
  limit: z.number().int().positive().max(500).default(100).optional(),
});

export async function POST(request: Request) {
  const header = request.headers.get("Authorization");
  if (
    !header?.startsWith("Bearer ") ||
    header.split(" ")[1] !== env.CALLBACK_SECRET
  ) {
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

  const limit = parsed.data.limit ?? 100;

  try {
    const stalePendingUploads = await db
      .select({
        fileKeyId: fileKeys.id,
        projectId: fileKeys.projectId,
        environmentId: fileKeys.environmentId,
        callbackMetadata: fileKeys.callbackMetadata,
        fileId: fileKeys.fileId,
        fileAdapterKey: files.adapterKey,
      })
      .from(fileKeys)
      .leftJoin(files, eq(fileKeys.fileId, files.id))
      .innerJoin(projects, eq(fileKeys.projectId, projects.id))
      .where(
        and(
          eq(fileKeys.status, "pending"),
          sql`${fileKeys.createdAt} <= now() - (${projects.pendingUploadFailAfterHours} * interval '1 hour')`,
        ),
      )
      .orderBy(asc(fileKeys.createdAt), asc(fileKeys.id))
      .limit(limit);

    let markedFailed = 0;
    let skipped = 0;
    let errors = 0;

    for (const upload of stalePendingUploads) {
      try {
        let storageCleanupAttempted = false;
        let storageCleanupSucceeded = false;

        const uploadSessionParsed = uploadSessionSchema.safeParse(
          upload.callbackMetadata &&
            typeof upload.callbackMetadata === "object" &&
            !Array.isArray(upload.callbackMetadata) &&
            "uploadSession" in upload.callbackMetadata
            ? (upload.callbackMetadata as Record<string, unknown>).uploadSession
            : undefined,
        );

        if (uploadSessionParsed.success) {
          storageCleanupAttempted = true;
          const cleanupResponse = await fetch(
            `${env.WORKER_URL}/internal/tus/${uploadSessionParsed.data.uploadId}/delete`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.CALLBACK_SECRET}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ projectId: upload.projectId }),
            },
          );

          if (cleanupResponse.ok || cleanupResponse.status === 404) {
            storageCleanupSucceeded = true;
          } else {
            const details = await cleanupResponse.text().catch(() => "");

            if (uploadSessionParsed.data.adapterKey) {
              const deleteUrl = `${env.WORKER_URL}/internal/delete/${encodeURIComponent(uploadSessionParsed.data.adapterKey)}`;
              const deleteResponse = await fetch(deleteUrl, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${env.CALLBACK_SECRET}`,
                },
              });

              if (deleteResponse.ok) {
                storageCleanupSucceeded = true;
              }
            }

            if (!storageCleanupSucceeded) {
              errors += 1;
              console.error(
                "Failed to cleanup stale upload before marking failed",
                {
                  fileKeyId: upload.fileKeyId,
                  projectId: upload.projectId,
                  environmentId: upload.environmentId,
                  uploadId: uploadSessionParsed.data.uploadId,
                  status: cleanupResponse.status,
                  details,
                },
              );
              continue;
            }
          }
        } else if (upload.fileAdapterKey) {
          storageCleanupAttempted = true;
          const deleteUrl = `${env.WORKER_URL}/internal/delete/${encodeURIComponent(upload.fileAdapterKey)}`;
          const deleteResponse = await fetch(deleteUrl, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${env.CALLBACK_SECRET}`,
            },
          });

          if (deleteResponse.ok) {
            storageCleanupSucceeded = true;
          } else {
            const details = await deleteResponse.text().catch(() => "");
            errors += 1;
            console.error(
              "Failed adapter-key fallback cleanup before marking failed",
              {
                fileKeyId: upload.fileKeyId,
                projectId: upload.projectId,
                environmentId: upload.environmentId,
                adapterKey: upload.fileAdapterKey,
                status: deleteResponse.status,
                details,
              },
            );
            continue;
          }
        }

        await markUploadAsFailed(db, {
          projectId: upload.projectId,
          environmentId: upload.environmentId,
          fileKeyId: upload.fileKeyId,
          error: "Automatically marked as failed after pending upload timeout",
        });

        if (!storageCleanupAttempted) {
          const existingMeta =
            upload.callbackMetadata &&
            typeof upload.callbackMetadata === "object" &&
            !Array.isArray(upload.callbackMetadata)
              ? (upload.callbackMetadata as Record<string, unknown>)
              : {};

          await db
            .update(fileKeys)
            .set({
              callbackMetadata: {
                ...existingMeta,
                cleanupSkippedAt: new Date().toISOString(),
                cleanupSkipReason: "missing_upload_session_and_adapter_key",
              },
            })
            .where(eq(fileKeys.id, upload.fileKeyId));
        }

        markedFailed += 1;
      } catch (error) {
        if (error instanceof UploadFailureError) {
          if (
            error.code === "ALREADY_COMPLETED" ||
            error.code === "ALREADY_FAILED" ||
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            error.code === "NOT_FOUND"
          ) {
            skipped += 1;
            continue;
          }
        }

        errors += 1;
        console.error("Failed to auto-mark stale pending upload", {
          fileKeyId: upload.fileKeyId,
          projectId: upload.projectId,
          environmentId: upload.environmentId,
          error,
        });
      }
    }

    return new Response(
      JSON.stringify({
        selected: stalePendingUploads.length,
        markedFailed,
        skipped,
        errors,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error auto-marking stale pending uploads:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
