import { z } from "zod";

import {
  enqueueUploadWebhookEvent,
  markUploadAsFailed,
  UploadFailureError,
} from "@silo-storage/api/services";
import { eq, sql } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import {
  projectEnvironments,
  projects,
  usageDaily,
  usageEvents,
} from "@silo-storage/db/schema";
import { publishMessage } from "@silo-storage/redis";
import {
  createUploadEventEnvelope,
  normalizeFileKeyMetadata,
} from "@silo-storage/shared";

import { env } from "@/env";
import { completeFileKeyFromCallback } from "@/lib/upload/register";

const schema = z.union([
  z.object({
    type: z.literal("upload-completed"),
    data: z.object({
      environmentId: z.string(),
      fileKeyId: z.string(),
      accessKey: z.string(),
      fileName: z.string(),
      claimedSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      claimedHash: z.string().nullable(),
      claimedMimeType: z.string().nullable(),
      actualHash: z.string().nullable(),
      actualMimeType: z.string(),
      actualSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      adapterKey: z.string(),
      projectId: z.string(),
      isPublic: z.boolean().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal("upload-failed"),
    data: z.object({
      environmentId: z.string(),
      fileKeyId: z.string(),
      projectId: z.string(),
      error: z.string().optional(),
    }),
  }),
]);

async function trackUsageEvent(
  eventType: "upload_completed" | "upload_failed" | "download",
  projectId: string,
  environmentId: string,
  bytes?: number,
  fileId?: string,
) {
  try {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { parentOrganizationId: true },
    });

    if (!project?.parentOrganizationId) return;

    const organizationId = project.parentOrganizationId;

    await db.insert(usageEvents).values({
      organizationId,
      projectId,
      environmentId,
      eventType,
      bytes: bytes ?? null,
      fileId: fileId ?? null,
    });

    const today = new Date().toISOString().substring(0, 10);

    const updateField = {
      upload_completed: "uploadsCompleted",
      upload_failed: "uploadsFailed",
      download: "downloads",
    }[eventType] as "uploadsCompleted" | "uploadsFailed" | "downloads";

    const bytesField =
      eventType === "upload_completed" ? "bytesUploaded" : null;

    await db
      .insert(usageDaily)
      .values({
        organizationId,
        projectId,
        environmentId,
        date: today,
        [updateField]: 1,
        ...(bytesField && bytes ? { [bytesField]: bytes } : {}),
      })
      .onConflictDoUpdate({
        target: [
          usageDaily.organizationId,
          usageDaily.projectId,
          usageDaily.environmentId,
          usageDaily.date,
        ],
        set: {
          [updateField]: sql`${usageDaily[updateField]} + 1`,
          ...(bytesField && bytes
            ? { [bytesField]: sql`${usageDaily[bytesField]} + ${bytes}` }
            : {}),
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("Failed to track usage event:", error);
  }
}

async function cleanupAdapterKey(adapterKey: string) {
  const deleteUrl = `${env.WORKER_URL}/internal/delete/${encodeURIComponent(adapterKey)}`;
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.CALLBACK_SECRET}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to cleanup adapter key (${response.status}): ${body || response.statusText}`,
    );
  }
}

export async function POST(request: Request) {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const token = header.split(" ")[1];
  if (!token || token !== env.CALLBACK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request",
        details: parsed.error.issues,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { type, data } = parsed.data;

  if (type === "upload-completed") {
    try {
      const environment = await db.query.projectEnvironments.findFirst({
        where: eq(projectEnvironments.id, data.environmentId),
      });

      if (!environment) {
        return new Response(
          JSON.stringify({ error: "Environment not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      const completion = await completeFileKeyFromCallback({
        projectId: data.projectId,
        environmentId: data.environmentId,
        fileKeyId: data.fileKeyId,
        accessKey: data.accessKey,
        fileName: data.fileName,
        claimedSize: data.claimedSize,
        claimedMimeType: data.claimedMimeType,
        claimedHash: data.claimedHash,
        isPublic: data.isPublic,
        actualSize: data.actualSize,
        actualMimeType: data.actualMimeType,
        actualHash: data.actualHash,
        adapterKey: data.adapterKey,
        metadata: data.metadata,
      });

      if (completion.alreadyFailed) {
        try {
          await cleanupAdapterKey(data.adapterKey);
        } catch (cleanupError) {
          console.error(
            "Failed to cleanup adapter key for already-failed upload:",
            cleanupError,
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            status: "failed",
            note: "File key already failed; completion callback ignored.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      const file = completion.file;
      const fileKey = completion.fileKey;

      if (completion.alreadyCompleted && file.adapterKey !== data.adapterKey) {
        try {
          await cleanupAdapterKey(data.adapterKey);
        } catch (cleanupError) {
          console.error(
            "Failed to cleanup duplicate completion adapter key:",
            cleanupError,
          );
        }
      }

      const uploadCompletedEvent = createUploadEventEnvelope(
        "upload.completed",
        {
          environmentId: data.environmentId,
          projectId: data.projectId,
          fileKeyId: fileKey.id,
          accessKey: fileKey.accessKey,
          fileId: file.id,
          fileName: fileKey.fileName,
          hash: file.hash,
          mimeType: file.mimeType,
          size: file.size,
          metadata: normalizeFileKeyMetadata(fileKey.metadata),
        },
        `upload.completed:${fileKey.id}`,
      );

      try {
        await publishMessage(`upload:${data.fileKeyId}`, uploadCompletedEvent);
      } catch (pubError) {
        console.error("Failed to publish upload completion message:", pubError);
      }

      if (!completion.alreadyCompleted) {
        try {
          await enqueueUploadWebhookEvent(db, {
            environmentId: data.environmentId,
            projectId: data.projectId,
            event: uploadCompletedEvent,
            idempotencyKey: uploadCompletedEvent.id,
          });
        } catch (enqueueError) {
          console.error(
            "Failed to enqueue upload completion webhook:",
            enqueueError,
          );
        }
      }

      if (!completion.alreadyCompleted) {
        void trackUsageEvent(
          "upload_completed",
          data.projectId,
          data.environmentId,
          data.actualSize,
          file.id,
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          fileKeyId: fileKey.id,
          accessKey: fileKey.accessKey,
          fileId: file.id,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error processing upload completion:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } else if (type === "upload-failed") {
    try {
      await markUploadAsFailed(db, {
        projectId: data.projectId,
        environmentId: data.environmentId,
        fileKeyId: data.fileKeyId,
        error: data.error,
      });

      return new Response(JSON.stringify({ success: true, status: "failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      // If the fileKey doesn't exist or is already in a terminal state,
      // still return success to the worker since there's nothing to retry.
      if (error instanceof UploadFailureError) {
        return new Response(
          JSON.stringify({
            success: true,
            status: "failed",
            note: error.message,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      console.error("Error processing upload failure:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Unknown type" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
