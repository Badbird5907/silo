import { z } from "zod";

import { and, asc, eq, sql } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys, projects } from "@silo-storage/db/schema";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";
import { markUploadAsFailed, UploadFailureError } from "@silo-storage/api/service/fileKey";
import { runLifecycleJobBatch } from "@silo-storage/api/service/lifecycleJob";

const bodySchema = z.object({
  limit: z.number().int().positive().max(500).default(100).optional(),
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

    for (const upload of stalePendingUploads) {
      try {
        await markUploadAsFailed(db, {
          projectId: upload.projectId,
          environmentId: upload.environmentId,
          fileKeyId: upload.fileKeyId,
          error: "Automatically marked as failed after pending upload timeout",
        });

        markedFailed += 1;
      } catch (error) {
        if (error instanceof UploadFailureError) {
          if (
            error.code === "ALREADY_COMPLETED" ||
            error.code === "ALREADY_FAILED" ||
            error.code === "NOT_FOUND"
          ) {
            skipped += 1;
            continue;
          }
        }

        errors += 1;
        console.error("Failed to auto-mark stale pending upload", {
          fileKeyId: upload.fileKeyId,
          projectId: upload.projectId,
          environmentId: upload.environmentId,
          error,
        });
      }
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
