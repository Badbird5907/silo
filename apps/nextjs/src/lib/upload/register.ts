import { z } from "zod";

import { and, eq, sql } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import {
  fileKeys,
  files,
  projectEnvironments,
  projects,
} from "@silo-storage/db/schema";
import { clearUploadSessionAdapterData } from "@silo-storage/shared";

const unknownRecordSchema = z.record(z.string(), z.unknown());

export const registerFileKeySchema = z.object({
  fileKeyId: z.string().min(1),
  accessKey: z.string().min(1),
  fileName: z.string().min(1),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  mimeType: z.string().optional(),
  hash: z.string().optional(),
  isPublic: z.boolean().optional(),
  metadata: unknownRecordSchema.optional(),
});

export const registerUploadBodySchema = z.object({
  environmentId: z.string(),
  fileKeys: z.array(registerFileKeySchema).min(1),
  metadata: unknownRecordSchema.optional(),
  callbackUrl: z.url().optional(),
  callbackMetadata: unknownRecordSchema.optional(),
  dev: z.boolean().optional(),
  fileExpiry: z
    .union([
      z.object({
        ttlSeconds: z.number().int().positive(),
      }),
      z.object({
        expiresAt: z.string().datetime().nullable(),
      }),
    ])
    .optional(),
});

export type RegisterUploadBody = z.infer<typeof registerUploadBodySchema>;
export type RegisterUploadFileKey = z.infer<typeof registerFileKeySchema>;
type FileKeyRow = typeof fileKeys.$inferSelect;
type FileRow = typeof files.$inferSelect;

type FileKeyMetadata = Record<string, unknown>;

function mergeMetadata(
  existing: unknown,
  input: {
    requestMetadata?: Record<string, unknown>;
    fileMetadata?: Record<string, unknown>;
  },
): FileKeyMetadata {
  const existingObject =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as FileKeyMetadata)
      : {};

  const merged: FileKeyMetadata = {
    ...existingObject,
    ...(input.requestMetadata ?? {}),
    ...(input.fileMetadata ?? {}),
  };

  return merged;
}

function mergeCallbackMetadata(
  existing: unknown,
  input: {
    callbackUrl?: string;
    callbackMetadata?: Record<string, unknown>;
    apiKeyId?: string;
  },
): FileKeyMetadata | null {
  const existingObject =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as FileKeyMetadata)
      : {};

  const merged: FileKeyMetadata = {
    ...existingObject,
  };

  if (input.callbackUrl) {
    merged.callbackUrl = input.callbackUrl;
  }
  if (
    input.apiKeyId &&
    (input.callbackUrl ||
      input.callbackMetadata ||
      Object.keys(existingObject).length > 0)
  ) {
    merged.apiKeyId = input.apiKeyId;
  }
  if (input.callbackMetadata) {
    Object.assign(merged, input.callbackMetadata);
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

interface LockableExecutor {
  execute: typeof db.execute;
}

async function lockFileKey(executor: LockableExecutor, fileKeyId: string) {
  // we lock to prevent creating duplicate file keys
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtext(${fileKeyId}))`,
  );
}

export async function registerFileKeyIntent(input: {
  projectId: string;
  environmentId: string;
  fileKey: RegisterUploadFileKey;
  expiresAt?: Date | null;
  requestMetadata?: Record<string, unknown>;
  callbackUrl?: string;
  callbackMetadata?: Record<string, unknown>;
  apiKeyId?: string;
}) {
  return db.transaction(async (tx) => {
    await lockFileKey(tx, input.fileKey.fileKeyId);

    const [project, environment] = await Promise.all([
      tx.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { id: true, lifecycleState: true },
      }),
      tx.query.projectEnvironments.findFirst({
        where: and(
          eq(projectEnvironments.id, input.environmentId),
          eq(projectEnvironments.projectId, input.projectId),
        ),
        columns: { id: true, lifecycleState: true },
      }),
    ]);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.lifecycleState === "deleting") {
      throw new Error("Project is currently deleting");
    }

    if (!environment) {
      throw new Error("Environment not found");
    }

    if (environment.lifecycleState === "deleting") {
      throw new Error("Environment is currently deleting");
    }

    const byId = await tx.query.fileKeys.findFirst({
      where: eq(fileKeys.id, input.fileKey.fileKeyId),
    });

    const byAccessKey = byId
      ? undefined
      : await tx.query.fileKeys.findFirst({
          where: and(
            eq(fileKeys.projectId, input.projectId),
            eq(fileKeys.accessKey, input.fileKey.accessKey),
          ),
        });

    const existing = byId ?? byAccessKey;
    const mergedMetadata = mergeMetadata(existing?.metadata, {
      requestMetadata: input.requestMetadata,
      fileMetadata: input.fileKey.metadata,
    });
    const mergedCallbackMetadata = mergeCallbackMetadata(
      existing?.callbackMetadata,
      {
        callbackUrl: input.callbackUrl,
        callbackMetadata: input.callbackMetadata,
        apiKeyId: input.apiKeyId,
      },
    );

    if (existing) {
      if (
        existing.projectId !== input.projectId ||
        existing.environmentId !== input.environmentId
      ) {
        throw new Error(
          "File key does not belong to the target project/environment",
        );
      }
      if (
        existing.id !== input.fileKey.fileKeyId ||
        existing.accessKey !== input.fileKey.accessKey
      ) {
        throw new Error("File key identity mismatch");
      }

      const [updated] = await tx
        .update(fileKeys)
        .set({
          fileName: input.fileKey.fileName,
          isPublic: input.fileKey.isPublic ?? existing.isPublic,
          claimedSize: input.fileKey.size,
          claimedMimeType: input.fileKey.mimeType ?? existing.claimedMimeType,
          claimedHash: input.fileKey.hash ?? existing.claimedHash,
          metadata: mergedMetadata,
          callbackMetadata: mergedCallbackMetadata,
          expiresAt: input.expiresAt ?? existing.expiresAt,
        })
        .where(eq(fileKeys.id, existing.id))
        .returning();

      if (!updated) {
        throw new Error("Failed to update file key registration");
      }

      return updated;
    }

    const [created] = await tx
      .insert(fileKeys)
      .values({
        id: input.fileKey.fileKeyId,
        accessKey: input.fileKey.accessKey,
        fileName: input.fileKey.fileName,
        projectId: input.projectId,
        environmentId: input.environmentId,
        fileId: null,
        isPublic: input.fileKey.isPublic ?? false,
        metadata: mergedMetadata,
        callbackMetadata: mergedCallbackMetadata,
        claimedSize: input.fileKey.size,
        claimedMimeType: input.fileKey.mimeType ?? null,
        claimedHash: input.fileKey.hash ?? null,
        status: "pending",
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create file key registration");
    }

    return created;
  });
}

export async function completeFileKeyFromCallback(input: {
  projectId: string;
  environmentId: string;
  fileKeyId: string;
  accessKey: string;
  fileName: string;
  claimedSize: number;
  claimedMimeType?: string | null;
  claimedHash?: string | null;
  isPublic?: boolean;
  actualSize: number;
  actualMimeType: string;
  actualHash?: string | null;
  storageKey: string;
  metadata?: Record<string, unknown>;
}): Promise<
  | {
      fileKey: FileKeyRow;
      file: FileRow;
      alreadyCompleted: boolean;
      alreadyFailed: false;
    }
  | {
      fileKey: FileKeyRow;
      file: null;
      alreadyCompleted: false;
      alreadyFailed: true;
    }
> {
  return db.transaction(async (tx) => {
    await lockFileKey(tx, input.fileKeyId);

    const existingById = await tx.query.fileKeys.findFirst({
      where: eq(fileKeys.id, input.fileKeyId),
    });

    const existingByAccess = existingById
      ? undefined
      : await tx.query.fileKeys.findFirst({
          where: and(
            eq(fileKeys.projectId, input.projectId),
            eq(fileKeys.accessKey, input.accessKey),
          ),
        });

    const existing = existingById ?? existingByAccess;
    const mergedMetadata = mergeMetadata(existing?.metadata, {
      requestMetadata: input.metadata,
    });

    let claimedFileKey = existing;
    if (!claimedFileKey) {
      const [created] = await tx
        .insert(fileKeys)
        .values({
          id: input.fileKeyId,
          accessKey: input.accessKey,
          fileName: input.fileName,
          projectId: input.projectId,
          environmentId: input.environmentId,
          fileId: null,
          isPublic: input.isPublic ?? false,
          metadata: mergedMetadata,
          claimedSize: input.claimedSize,
          claimedMimeType: input.claimedMimeType ?? null,
          claimedHash: input.claimedHash ?? null,
          status: "pending",
        })
        .returning();

      if (!created) {
        throw new Error("Failed to create callback file key");
      }
      claimedFileKey = created;
    } else {
      if (
        claimedFileKey.projectId !== input.projectId ||
        claimedFileKey.environmentId !== input.environmentId
      ) {
        throw new Error("Callback file key does not match project/environment");
      }

      if (
        claimedFileKey.id !== input.fileKeyId ||
        claimedFileKey.accessKey !== input.accessKey
      ) {
        throw new Error("Callback file key identity mismatch");
      }
    }

    if (claimedFileKey.status === "completed" && claimedFileKey.fileId) {
      const existingFile = await tx.query.files.findFirst({
        where: eq(files.id, claimedFileKey.fileId),
      });

      if (existingFile) {
        return {
          fileKey: claimedFileKey,
          file: existingFile,
          alreadyCompleted: true,
          alreadyFailed: false,
        };
      }
    }

    if (claimedFileKey.status === "failed") {
      return {
        fileKey: claimedFileKey,
        file: null,
        alreadyCompleted: false,
        alreadyFailed: true,
      };
    }

    const [file] = await tx
      .insert(files)
      .values({
        hash: input.actualHash ?? null,
        mimeType: input.actualMimeType,
        size: input.actualSize,
        storageKey: input.storageKey,
        environmentId: input.environmentId,
        projectId: input.projectId,
      })
      .returning();

    if (!file) {
      throw new Error("Failed to create callback file record");
    }

    const [updatedFileKey] = await tx
      .update(fileKeys)
      .set({
        fileId: file.id,
        fileName: input.fileName,
        claimedHash: input.claimedHash ?? null,
        claimedMimeType: input.claimedMimeType ?? null,
        claimedSize: input.claimedSize,
        status: "completed",
        uploadCompletedAt: new Date(),
        uploadFailedAt: null,
        adapterData: clearUploadSessionAdapterData(claimedFileKey.adapterData),
        isPublic: input.isPublic ?? claimedFileKey.isPublic,
        metadata: mergedMetadata,
      })
      .where(eq(fileKeys.id, claimedFileKey.id))
      .returning();

    if (!updatedFileKey) {
      throw new Error("Failed to update callback file key");
    }

    return {
      fileKey: updatedFileKey,
      file,
      alreadyCompleted: false,
      alreadyFailed: false,
    };
  });
}
