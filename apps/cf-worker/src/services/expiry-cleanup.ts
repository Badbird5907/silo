import { z } from "zod";

import type { Bindings } from "../types/bindings";
import { buildNextJsInternalHeaders } from "../lib/nextjs-internal";
import { reportMissingObject } from "./callback";
import { deleteObject } from "./r2/upload";

const expiryListResponseSchema = z.object({
  items: z.array(
    z.object({
      fileKeyId: z.string(),
      fileId: z.string(),
      projectId: z.string(),
      environmentId: z.string(),
      accessKey: z.string(),
      expiresAt: z.iso.datetime().nullable().optional(),
      storageKey: z.string().optional(),
      adapterKey: z.string().optional(),
    }),
  ),
});

const expiryFinalizeResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
  deletedFileIds: z.array(z.string()),
});

function resolvePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchExpiredBatch(env: Bindings, limit: number) {
  const response = await fetch(
    `${env.CONTROL_PLANE_URL}/api/internal/expiry/list`,
    {
      method: "POST",
      headers: buildNextJsInternalHeaders(env, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ limit }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to list expired files (${response.status}): ${text || response.statusText}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = expiryListResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Invalid expiry list response: ${parsed.error.message}`);
  }

  return parsed.data.items;
}

async function finalizeExpiredBatch(env: Bindings, fileIds: string[]) {
  const response = await fetch(
    `${env.CONTROL_PLANE_URL}/api/internal/expiry/finalize`,
    {
      method: "POST",
      headers: buildNextJsInternalHeaders(env, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ fileIds }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to finalize expired files (${response.status}): ${text || response.statusText}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = expiryFinalizeResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Invalid expiry finalize response: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

async function finalizeExpiredBatchWithRetry(
  env: Bindings,
  fileIds: string[],
): Promise<z.infer<typeof expiryFinalizeResponseSchema>> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await finalizeExpiredBatch(env, fileIds);
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }

      console.error("Failed to finalize expired files, retrying", {
        fileIds,
        attempt,
        maxAttempts,
        error,
      });

      await sleep(Math.min(200 * 2 ** (attempt - 1), 2000));
    }
  }

  throw new Error("Failed to finalize expired files");
}

export async function runExpiryCleanup(env: Bindings) {
  const batchSize = resolvePositiveInt(env.EXPIRY_CLEANUP_BATCH_SIZE, 100);
  const maxBatches = resolvePositiveInt(env.EXPIRY_CLEANUP_MAX_BATCHES, 10);

  let batchesProcessed = 0;
  let totalR2Deleted = 0;
  let totalDbDeleted = 0;

  while (batchesProcessed < maxBatches) {
    const expiredItems = await fetchExpiredBatch(env, batchSize);
    if (expiredItems.length === 0) {
      break;
    }

    const finalizedInBatch = new Set<string>();
    for (const item of expiredItems) {
      const storageKey = item.storageKey ?? item.adapterKey;
      if (!storageKey) {
        console.error("Failed to delete expired object from R2", {
          fileKeyId: item.fileKeyId,
          fileId: item.fileId,
          storageKey: item.storageKey ?? item.adapterKey,
          error: "Expired item missing storage key",
        });
        continue;
      }

      try {
        await deleteObject(storageKey, env);
        totalR2Deleted += 1;

        if (finalizedInBatch.has(item.fileId)) {
          continue;
        }

        try {
          const finalized = await finalizeExpiredBatchWithRetry(env, [
            item.fileId,
          ]);
          totalDbDeleted += finalized.deletedCount;
          finalizedInBatch.add(item.fileId);
        } catch (finalizeError: unknown) {
          console.error("Failed to finalize expired file after R2 deletion", {
            fileKeyId: item.fileKeyId,
            fileId: item.fileId,
            storageKey,
            finalizeError,
          });

          await reportMissingObject(
            {
              projectId: item.projectId,
              environmentId: item.environmentId,
              fileKeyId: item.fileKeyId,
              fileId: item.fileId,
              accessKey: item.accessKey,
              storageKey,
            },
            env,
          ).catch((reportError: unknown) => {
            console.error(
              "Failed to report missing object after finalize error",
              {
                fileKeyId: item.fileKeyId,
                fileId: item.fileId,
                storageKey,
                finalizeError,
                reportError,
              },
            );
            throw reportError;
          });
        }
      } catch (deleteError) {
        console.error("Failed to delete expired object from R2", {
          fileKeyId: item.fileKeyId,
          fileId: item.fileId,
          storageKey,
          error: deleteError,
        });
      }
    }

    batchesProcessed += 1;
  }

  console.info("Expiry cleanup run complete", {
    batchesProcessed,
    totalR2Deleted,
    totalDbDeleted,
  });
}
