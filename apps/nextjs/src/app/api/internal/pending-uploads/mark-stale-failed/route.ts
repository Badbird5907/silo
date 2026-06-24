import { z } from "zod";

import {
  markUploadAsFailed,
  UploadFailureError,
} from "@silo-storage/api/service/fileKey";
import { runLifecycleJobBatch } from "@silo-storage/api/service/lifecycleJob";
import { and, asc, eq, sql } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys, projects } from "@silo-storage/db/schema";
import { mapWithConcurrency } from "@silo-storage/shared";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";

const bodySchema = z.object({
  limit: z.number().int().positive().max(500).default(100).optional(),
});

// Each stale upload is failed independently (transaction + redis + webhook +
// usage tracking). Process them concurrently so the route latency scales with
// the slowest upload rather than the sum of all of them.
const MARK_STALE_CONCURRENCY = 8;

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

  try {
    const stalePendingUploads = await db
      .select({
        fileKeyId: fileKeys.id,
        projectId: fileKeys.projectId,
        environmentId: fileKeys.environmentId,
      })
      .from(fileKeys)
      .innerJoin(projects, eq(fileKeys.projectId, projects.id))
      .where(
        and(
          eq(fileKeys.status, "pending"),
          sql`${fileKeys.createdAt} <= now() - (${projects.pendingUploadFailAfterMinutes} * interval '1 minute')`,
        ),
      )
      .orderBy(asc(fileKeys.createdAt), asc(fileKeys.id))
      .limit(limit);

    let markedFailed = 0;
    let skipped = 0;
    let errors = 0;

    const outcomes = await mapWithConcurrency(
      stalePendingUploads,
      MARK_STALE_CONCURRENCY,
      async (upload) => {
        try {
          await markUploadAsFailed(db, {
            projectId: upload.projectId,
            environmentId: upload.environmentId,
            fileKeyId: upload.fileKeyId,
            error:
              "Automatically marked as failed after pending upload timeout",
          });

          return "marked" as const;
        } catch (error) {
          if (error instanceof UploadFailureError) {
            if (
              error.code === "ALREADY_COMPLETED" ||
              error.code === "ALREADY_FAILED" ||
              error.code === "NOT_FOUND"
            ) {
              return "skipped" as const;
            }
          }

          console.error("Failed to auto-mark stale pending upload", {
            fileKeyId: upload.fileKeyId,
            projectId: upload.projectId,
            environmentId: upload.environmentId,
            error,
          });
          return "error" as const;
        }
      },
    );

    for (const outcome of outcomes) {
      if (outcome === "marked") markedFailed += 1;
      else if (outcome === "skipped") skipped += 1;
      else errors += 1;
    }

    const drainResult = await runLifecycleJobBatch(db, {
      limit,
      leaseSeconds: 45,
      leaseOwner: "internal:pending-uploads/mark-stale-failed",
    });

    return new Response(
      JSON.stringify({
        selected: stalePendingUploads.length,
        markedFailed,
        skipped,
        errors,
        lifecycleJobs: drainResult,
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
