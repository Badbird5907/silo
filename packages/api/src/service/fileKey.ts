import type { Db } from "@silo-storage/db/client";

import { and, eq, sql } from "@silo-storage/db";
import {
  fileKeys,
  projects,
  usageDaily,
  usageEvents,
} from "@silo-storage/db/schema";
import { publishMessage } from "@silo-storage/redis";
import {
  clearUploadSessionAdapterData,
  createUploadEventEnvelope,
  getUploadSessionAdapterData,
  normalizeFileKeyMetadata,
} from "@silo-storage/shared";

import {
  enqueueAbortMultipartJob,
  enqueueDeleteObjectJob,
  enqueueFinalizeFailedFileKeyJob,
} from "./lifecycleJob";
import { enqueueUploadWebhookEvent } from "./webhook";

export class UploadFailureError extends Error {
  public readonly code:
    | "NOT_FOUND"
    | "ALREADY_COMPLETED"
    | "ALREADY_FAILED"
    | "ALREADY_DELETED";

  constructor(
    message: string,
    code:
      | "NOT_FOUND"
      | "ALREADY_COMPLETED"
      | "ALREADY_FAILED"
      | "ALREADY_DELETED",
  ) {
    super(message);
    this.name = "UploadFailureError";
    this.code = code;
  }
}

/**
 * Look up a file key by either fileKeyId or accessKey (within a project).
 * At least one identifier must be provided.
 */
export async function lookupFileKey(
  db: Db,
  opts: {
    projectId: string;
    fileKeyId?: string;
    accessKey?: string;
  },
) {
  if (opts.fileKeyId) {
    return db.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.id, opts.fileKeyId),
        eq(fileKeys.projectId, opts.projectId),
      ),
      with: { file: true },
    });
  }

  if (opts.accessKey) {
    return db.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.accessKey, opts.accessKey),
        eq(fileKeys.projectId, opts.projectId),
      ),
      with: { file: true },
    });
  }

  return undefined;
}

async function trackUsageEvent(
  db: Db,
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

/**
 * Marks a pending upload as failed. Shared between the tRPC mutation,
 * the public REST API, and the internal callback route.
 *
 * Handles:
 * - Validating the fileKey exists and is in a pending state
 * - Updating the DB (status + uploadFailedAt)
 * - Publishing a real-time Redis notification
 * - Tracking the upload_failed usage event
 *
 * @throws {UploadFailureError} if the fileKey is not found or not in a markable state
 */
export async function markUploadAsFailed(
  db: Db,
  opts: {
    projectId: string;
    environmentId: string;
    fileKeyId: string;
    error?: string;
  },
) {
  const updated = await db.transaction(async (tx) => {
    const fileKey = await tx.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.id, opts.fileKeyId),
        eq(fileKeys.projectId, opts.projectId),
      ),
      with: { file: true },
    });

    if (!fileKey) {
      throw new UploadFailureError("FileKey not found", "NOT_FOUND");
    }

    if (fileKey.environmentId !== opts.environmentId) {
      throw new UploadFailureError("FileKey not found", "NOT_FOUND");
    }

    if (fileKey.status === "completed") {
      throw new UploadFailureError(
        "Upload has already completed successfully",
        "ALREADY_COMPLETED",
      );
    }

    if (fileKey.status === "deleted") {
      throw new UploadFailureError(
        "Upload has already been deleted",
        "ALREADY_DELETED",
      );
    }

    if (fileKey.status === "failed") {
      throw new UploadFailureError(
        "Upload has already been marked as failed",
        "ALREADY_FAILED",
      );
    }

    const uploadSession = getUploadSessionAdapterData(fileKey.adapterData);

    if (uploadSession?.id) {
      await enqueueAbortMultipartJob(tx, {
        projectId: opts.projectId,
        environmentId: opts.environmentId,
        fileKeyId: fileKey.id,
        fileId: fileKey.file?.id ?? null,
        uploadSessionId: uploadSession.id,
        storageKey: uploadSession.storageKey,
        multipartUploadId: uploadSession.multipartUploadId ?? null,
        priority: 120,
      });
    } else if (uploadSession?.storageKey) {
      await enqueueDeleteObjectJob(tx, {
        projectId: opts.projectId,
        environmentId: opts.environmentId,
        fileKeyId: fileKey.id,
        fileId: fileKey.file?.id ?? null,
        storageKey: uploadSession.storageKey,
        priority: 110,
      });
    }

    if (fileKey.file?.storageKey) {
      await enqueueDeleteObjectJob(tx, {
        projectId: opts.projectId,
        environmentId: opts.environmentId,
        fileKeyId: fileKey.id,
        fileId: fileKey.file.id,
        storageKey: fileKey.file.storageKey,
        priority: 120,
      });
    }

    if (fileKey.file?.id) {
      await enqueueFinalizeFailedFileKeyJob(tx, {
        projectId: opts.projectId,
        environmentId: opts.environmentId,
        fileKeyId: fileKey.id,
        fileId: fileKey.file.id,
        priority: 100,
      });
    }

    const [next] = await tx
      .update(fileKeys)
      .set({
        status: "failed",
        uploadFailedAt: new Date(),
        adapterData: clearUploadSessionAdapterData(fileKey.adapterData),
      })
      .where(eq(fileKeys.id, opts.fileKeyId))
      .returning();

    if (!next) {
      throw new Error("Failed to update file key status");
    }

    return next;
  });

  // this is the message
  const uploadFailedEvent = createUploadEventEnvelope(
    "upload.failed",
    {
      environmentId: opts.environmentId,
      projectId: opts.projectId,
      fileKeyId: opts.fileKeyId,
      metadata: normalizeFileKeyMetadata(updated.metadata),
      error: opts.error ?? "Upload failed",
    },
    `upload.failed:${opts.fileKeyId}`,
  );

  // publish to redis
  try {
    await publishMessage(`upload:${opts.fileKeyId}`, uploadFailedEvent);
  } catch (pubError) {
    console.error("Failed to publish upload failure message:", pubError);
  }

  try {
    // publish webhook
    await enqueueUploadWebhookEvent(db, {
      environmentId: opts.environmentId,
      projectId: opts.projectId,
      event: uploadFailedEvent,
      idempotencyKey: uploadFailedEvent.id,
    });
  } catch (enqueueError) {
    console.error("Failed to enqueue upload failure webhook:", enqueueError);
  }

  // track usage analytics
  void trackUsageEvent(db, "upload_failed", opts.projectId, opts.environmentId);

  return updated;
}

export type DeleteFileKeyResult =
  | { status: "not_found" }
  | { status: "pending_rejected" }
  | { status: "already_deleted" }
  | { status: "deleted_without_cleanup" }
  | {
      status: "deleted_with_cleanup";
      fileId: string;
      storageKey: string;
    };

/**
 * Marks an existing file key as deleted.
 *
 * Completed and failed file keys are user-deletable tombstones.
 * Pending uploads must continue through the explicit failure/abort flow.
 */
export async function deleteFileKey(
  db: Db,
  opts: {
    projectId: string;
    fileKeyId: string;
    environmentId?: string;
  },
): Promise<DeleteFileKeyResult> {
  return db.transaction(async (tx) => {
    const fileKey = await tx.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.id, opts.fileKeyId),
        eq(fileKeys.projectId, opts.projectId),
      ),
      with: { file: true },
    });

    if (!fileKey) {
      return { status: "not_found" };
    }

    if (opts.environmentId && fileKey.environmentId !== opts.environmentId) {
      return { status: "not_found" };
    }

    if (fileKey.status === "deleted") {
      return { status: "already_deleted" };
    }

    if (fileKey.status === "pending") {
      return { status: "pending_rejected" };
    }

    const nextBase = {
      status: "deleted" as const,
      deletedAt: new Date(),
      adapterData: clearUploadSessionAdapterData(fileKey.adapterData),
    };

    if (!fileKey.file) {
      await tx
        .update(fileKeys)
        .set(nextBase)
        .where(eq(fileKeys.id, fileKey.id));

      return { status: "deleted_without_cleanup" };
    }

    await tx
      .update(fileKeys)
      .set(nextBase)
      .where(eq(fileKeys.id, fileKey.id));

    await enqueueDeleteObjectJob(tx, {
      projectId: opts.projectId,
      environmentId: fileKey.environmentId,
      fileKeyId: fileKey.id,
      fileId: fileKey.file.id,
      storageKey: fileKey.file.storageKey,
      priority: 120,
    });

    await enqueueFinalizeFailedFileKeyJob(tx, {
      projectId: opts.projectId,
      environmentId: fileKey.environmentId,
      fileKeyId: fileKey.id,
      fileId: fileKey.file.id,
      priority: 100,
    });

    return {
      status: "deleted_with_cleanup",
      fileId: fileKey.file.id,
      storageKey: fileKey.file.storageKey,
    };
  });
}
