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
  AuditChange,
  auditEventCodes,
  clearUploadSessionAdapterData,
  createUploadEventEnvelope,
  getUploadSessionAdapterData,
  normalizeFileKeyMetadata,
} from "@silo-storage/shared";

import type { AuditActor } from "./audit";
import type { AuditLogDownloadPolicy } from "./retention";
import {
  buildSystemAuditActor,
  recordAuditEvent,
  recordUsageAuditEvent,
} from "./audit";
import {
  enqueueAbortMultipartJob,
  enqueueDeleteObjectJob,
  enqueueFinalizeFailedFileKeyJob,
} from "./lifecycleJob";
import { computeRetentionExpiry } from "./retention";
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
  opts: {
    eventType: "upload_completed" | "upload_failed" | "download";
    projectId: string;
    environmentId: string;
    bytes?: number;
    fileId?: string;
    fileName?: string;
    actor?: AuditActor;
    isSignedUrl?: boolean;
  },
) {
  const {
    eventType,
    projectId,
    environmentId,
    bytes,
    fileId,
    fileName,
    actor,
    isSignedUrl,
  } = opts;
  try {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: {
        parentOrganizationId: true,
        auditLogDownloadPolicy: true,
        auditLogRetentionDays: true,
        usageEventRetentionDays: true,
      },
    });

    if (!project?.parentOrganizationId) return;

    const organizationId = project.parentOrganizationId;
    const createdAt = new Date();
    const expiresAt = computeRetentionExpiry(
      createdAt,
      project.usageEventRetentionDays,
    );

    await db.insert(usageEvents).values({
      organizationId,
      projectId,
      environmentId,
      eventType,
      bytes: bytes ?? null,
      fileId: fileId ?? null,
      createdAt,
      expiresAt,
    });

    await recordUsageAuditEvent(db, {
      organizationId,
      projectId,
      environmentId,
      eventType,
      bytes,
      fileId,
      resourceLabel: fileName ?? null,
      actor,
      createdAt,
      isSignedUrl,
      auditLogDownloadPolicy:
        project.auditLogDownloadPolicy as AuditLogDownloadPolicy,
      auditRetentionDays: project.auditLogRetentionDays,
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
    actor?: AuditActor;
  },
) {
  const [updated, fileKey] = await db.transaction(async (tx) => {
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

    return [next, fileKey];
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
  // void trackUsageEvent(db, "upload_failed", opts.projectId, opts.environmentId, undefined, undefined, fileKey.fileName);
  void trackUsageEvent(db, {
    eventType: "upload_failed",
    projectId: opts.projectId,
    environmentId: opts.environmentId,
    fileName: fileKey.fileName,
    actor: opts.actor,
  });

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
    audit: {
      organizationId: string;
      actor?: AuditActor;
    };
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

      await recordUsageAuditEvent(tx, {
        organizationId: opts.audit.organizationId,
        projectId: opts.projectId,
        environmentId: fileKey.environmentId,
        ...(opts.audit.actor ?? buildSystemAuditActor()),
        eventType: "file_deleted",
        resourceLabel: fileKey.fileName,
        metadata: {
          fileKeyId: fileKey.id,
          fileId: null,
          accessKey: fileKey.accessKey,
          previousStatus: fileKey.status,
          cleanupScheduled: false,
        },
      });

      return { status: "deleted_without_cleanup" };
    }

    await tx.update(fileKeys).set(nextBase).where(eq(fileKeys.id, fileKey.id));

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

    await recordUsageAuditEvent(tx, {
      organizationId: opts.audit.organizationId,
      projectId: opts.projectId,
      environmentId: fileKey.environmentId,
      ...(opts.audit.actor ?? buildSystemAuditActor()),
      eventType: "file_deleted",
      resourceLabel: fileKey.fileName,
      metadata: {
        fileKeyId: fileKey.id,
        fileId: fileKey.file.id,
        accessKey: fileKey.accessKey,
        previousStatus: fileKey.status,
        storageKey: fileKey.file.storageKey,
        cleanupScheduled: true,
      },
    });

    return {
      status: "deleted_with_cleanup",
      fileId: fileKey.file.id,
      storageKey: fileKey.file.storageKey,
    };
  });
}

export type UpdateFileKeyAccessResult =
  | { status: "not_found" }
  | { status: "serve_image_invalid"; message: string }
  | { status: "success"; fileKey: typeof fileKeys.$inferSelect };

/**
 * Updates `isPublic` and optionally `serveImage` on a file key.
 */
export async function updateFileKeyAccess(
  db: Db,
  opts: {
    projectId: string;
    fileKeyId: string;
    isPublic: boolean;
    environmentId: string;
    serveImage?: boolean;
    actor?: AuditActor;
  },
): Promise<UpdateFileKeyAccessResult> {
  const fileKey = await db.query.fileKeys.findFirst({
    where: and(
      eq(fileKeys.id, opts.fileKeyId),
      eq(fileKeys.projectId, opts.projectId),
      eq(fileKeys.environmentId, opts.environmentId),
    ),
    with: {
      file: {
        columns: {
          mimeType: true,
        },
      },
    },
  });
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, opts.projectId),
    columns: { parentOrganizationId: true },
  });
  const parentOrganizationId = project?.parentOrganizationId;

  if (!fileKey || !parentOrganizationId) {
    return { status: "not_found" };
  }

  if (typeof opts.serveImage === "boolean") {
    const mimeType = fileKey.file?.mimeType ?? fileKey.claimedMimeType;
    const isImageFile =
      typeof mimeType === "string" && mimeType.startsWith("image/");

    if (!isImageFile) {
      return {
        status: "serve_image_invalid",
        message: "serveImage can only be updated for image files",
      };
    }
  }

  const updatePayload: { isPublic: boolean; serveImage?: boolean } = {
    isPublic: opts.isPublic,
  };

  if (typeof opts.serveImage === "boolean") {
    updatePayload.serveImage = opts.serveImage;
  }

  const changes: AuditChange[] = [];
  if (fileKey.isPublic !== opts.isPublic) {
    changes.push({
      path: "isPublic",
      before: fileKey.isPublic,
      after: opts.isPublic,
    });
  }
  if (fileKey.serveImage !== opts.serveImage) {
    changes.push({
      path: "serveImage",
      before: fileKey.serveImage,
      after: opts.serveImage,
    });
  }

  const updated = await db.transaction(async (tx) => {
    const [upd] = await tx
      .update(fileKeys)
      .set(updatePayload)
      .where(eq(fileKeys.id, opts.fileKeyId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: parentOrganizationId,
      projectId: opts.projectId,
      environmentId: opts.environmentId,
      eventCode: auditEventCodes.fileKeyAccessUpdated,
      eventCategory: "lifecycle",
      resourceType: "file_key",
      resourceId: fileKey.id,
      resourceLabel: fileKey.fileName,
      status: "success",
      summary: `File key access updated for ${fileKey.fileName}`,
      changes,
      ...(opts.actor ?? buildSystemAuditActor()),
      metadata: {
        fileKeyId: fileKey.id,
      },
    });
    return upd;
  });

  if (!updated) {
    return { status: "not_found" };
  }

  return { status: "success", fileKey: updated };
}
