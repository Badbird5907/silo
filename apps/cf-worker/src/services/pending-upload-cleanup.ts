import { z } from "zod";

import type { Bindings } from "../types/bindings";
import { buildNextJsInternalHeaders } from "../lib/nextjs-internal";

const pendingUploadCleanupResponseSchema = z.object({
  selected: z.number().int().nonnegative(),
  markedFailed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
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

async function processStalePendingBatch(env: Bindings, limit: number) {
  const response = await fetch(
    `${env.CONTROL_PLANE_URL}/api/internal/pending-uploads/mark-stale-failed`,
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
      `Failed to process stale pending uploads (${response.status}): ${text || response.statusText}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = pendingUploadCleanupResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Invalid stale pending cleanup response: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

export async function runPendingUploadCleanup(env: Bindings) {
  const batchSize = resolvePositiveInt(
    env.PENDING_UPLOAD_CLEANUP_BATCH_SIZE,
    100,
  );
  const maxBatches = resolvePositiveInt(
    env.PENDING_UPLOAD_CLEANUP_MAX_BATCHES,
    10,
  );

  let batchesProcessed = 0;
  let totalSelected = 0;
  let totalMarkedFailed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  while (batchesProcessed < maxBatches) {
    const result = await processStalePendingBatch(env, batchSize);
    if (result.selected === 0) {
      break;
    }

    totalSelected += result.selected;
    totalMarkedFailed += result.markedFailed;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
    batchesProcessed += 1;

    if (result.selected < batchSize) {
      break;
    }
  }

  console.info("Pending upload cleanup run complete", {
    batchesProcessed,
    totalSelected,
    totalMarkedFailed,
    totalSkipped,
    totalErrors,
  });
}
