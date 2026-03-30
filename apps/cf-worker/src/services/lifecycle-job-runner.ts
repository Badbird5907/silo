import { z } from "zod";

import { buildNextJsInternalHeaders } from "../lib/nextjs-internal";
import type { Bindings } from "../types/bindings";

const lifecycleJobRunResponseSchema = z.object({
  batches: z.number().int().nonnegative(),
  claimed: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  retried: z.number().int().nonnegative(),
  dead: z.number().int().nonnegative(),
  deadRequeued: z.number().int().nonnegative().optional(),
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

async function runLifecycleBatch(
  env: Bindings,
  input: { limit: number; maxBatches: number; leaseSeconds: number },
) {
  const response = await fetch(
    `${env.NEXTJS_CALLBACK_URL}/api/internal/lifecycle-jobs/run`,
    {
      method: "POST",
      headers: buildNextJsInternalHeaders(env, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to run lifecycle jobs (${response.status}): ${text || response.statusText}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = lifecycleJobRunResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Invalid lifecycle jobs response: ${parsed.error.message}`);
  }

  return parsed.data;
}

export async function runLifecycleJobs(env: Bindings) {
  const limit = resolvePositiveInt(env.LIFECYCLE_JOB_BATCH_SIZE, 100);
  const maxBatches = resolvePositiveInt(env.LIFECYCLE_JOB_MAX_BATCHES, 10);
  const leaseSeconds = resolvePositiveInt(env.LIFECYCLE_JOB_LEASE_SECONDS, 60);

  const result = await runLifecycleBatch(env, {
    limit,
    maxBatches,
    leaseSeconds,
  });

  if (result.dead > 0) {
    console.error("Lifecycle jobs moved to dead state", {
      dead: result.dead,
      deadRequeued: result.deadRequeued ?? 0,
      claimed: result.claimed,
      completed: result.completed,
      retried: result.retried,
    });
  }

  console.info("Lifecycle job drain complete", result);
}
