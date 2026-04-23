import { z } from "zod";

import {
  requeueDeadLifecycleJobs,
  runLifecycleJobBatch,
} from "@silo-storage/api/service/lifecycleJob";
import { db } from "@silo-storage/db/client";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";

const bodySchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
  maxBatches: z.number().int().positive().max(50).optional(),
  leaseSeconds: z.number().int().positive().max(600).optional(),
});

export async function POST(request: Request) {
  if (!isCallbackAuthorized(request)) {
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
  const maxBatches = parsed.data.maxBatches ?? 10;
  const leaseSeconds = parsed.data.leaseSeconds ?? 60;

  try {
    let batches = 0;
    let claimed = 0;
    let completed = 0;
    let retried = 0;
    let dead = 0;
    let deadRequeued = 0;

    while (batches < maxBatches) {
      const result = await runLifecycleJobBatch(db, {
        limit,
        leaseSeconds,
      });

      batches += 1;
      claimed += result.claimed;
      completed += result.completed;
      retried += result.retried;
      dead += result.dead;

      if (result.claimed < limit) {
        break;
      }
    }

    const replay = await requeueDeadLifecycleJobs(db, {
      limit: 200,
      kinds: [
        "delete_object",
        "abort_multipart",
        "finalize_failed_filekey",
      ],
    });
    deadRequeued = replay.requeued;

    if (deadRequeued > 0) {
      for (let replayBatch = 0; replayBatch < 5; replayBatch++) {
        const replayResult = await runLifecycleJobBatch(db, {
          limit,
          leaseSeconds,
        });

        batches += 1;
        claimed += replayResult.claimed;
        completed += replayResult.completed;
        retried += replayResult.retried;
        dead += replayResult.dead;

        if (replayResult.claimed < limit) {
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({
        batches,
        claimed,
        completed,
        retried,
        dead,
        deadRequeued,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Lifecycle job run failed", { error });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
