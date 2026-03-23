import { z } from "zod";

import { runLifecycleJobBatch } from "@silo-storage/api/services";
import { db } from "@silo-storage/db/client";

import { env } from "@/env";

const bodySchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
  maxBatches: z.number().int().positive().max(50).optional(),
  leaseSeconds: z.number().int().positive().max(600).optional(),
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
  const maxBatches = parsed.data.maxBatches ?? 10;
  const leaseSeconds = parsed.data.leaseSeconds ?? 60;

  try {
    let batches = 0;
    let claimed = 0;
    let completed = 0;
    let retried = 0;
    let dead = 0;

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

    return new Response(
      JSON.stringify({
        batches,
        claimed,
        completed,
        retried,
        dead,
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
