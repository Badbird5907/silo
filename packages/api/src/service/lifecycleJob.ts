import type { Db } from "@silo-storage/db/client";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "@silo-storage/db";
import { fileKeys, fileLifecycleJobs, files } from "@silo-storage/db/schema";
import { clearUploadSessionAdapterData } from "@silo-storage/shared";

import { env } from "../env";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const ALWAYS_RETRY_CLEANUP_KINDS = new Set<LifecycleJobKind>([
  "delete_object",
  "abort_multipart",
]);

export type LifecycleJobKind =
  | "delete_object"
  | "abort_multipart"
  | "finalize_failed_filekey"
  | "repair_missing_object";

export interface EnqueueLifecycleJobInput {
  kind: LifecycleJobKind;
  projectId?: string | null;
  environmentId?: string | null;
  fileKeyId?: string | null;
  fileId?: string | null;
  storageKey?: string | null;
  uploadSessionId?: string | null;
  multipartUploadId?: string | null;
  adapterData?: Record<string, unknown> | null;
  idempotencyKey?: string;
  maxAttempts?: number;
  priority?: number;
  nextAttemptAt?: Date;
}

interface LifecycleJobAdapterData {
  storageKey?: string;
  uploadSessionId?: string;
  multipartUploadId?: string;
}

type JobExecutor = Pick<Db, "execute" | "insert">;

interface ClaimOptions {
  limit?: number;
  leaseSeconds?: number;
  leaseOwner?: string;
}

interface RequeueDeadOptions {
  limit?: number;
  kinds?: LifecycleJobKind[];
}

type LifecycleJobExecutionResult =
  | { ok: true }
  | {
      ok: false;
      retryable: boolean;
      errorCode: string;
      message: string;
      httpStatus?: number;
    };

function resolveIdempotencyKey(input: EnqueueLifecycleJobInput): string {
  if (input.idempotencyKey) return input.idempotencyKey;

  const parts = [
    input.kind,
    input.projectId ?? "-",
    input.environmentId ?? "-",
    input.fileKeyId ?? "-",
    input.fileId ?? "-",
    input.storageKey ?? "-",
    input.uploadSessionId ?? "-",
    input.multipartUploadId ?? "-",
  ];

  return parts.join(":");
}

function nextBackoffMs(attemptCount: number): number {
  const boundedAttempt = Math.min(Math.max(attemptCount, 1), 8);
  return Math.min(2 ** boundedAttempt * 1000, 5 * 60 * 1000);
}

export async function enqueueLifecycleJob(
  executor: JobExecutor,
  input: EnqueueLifecycleJobInput,
): Promise<void> {
  const idempotencyKey = resolveIdempotencyKey(input);
  const adapterData: LifecycleJobAdapterData = {
    ...(input.adapterData ?? {}),
    ...(input.storageKey ? { storageKey: input.storageKey } : {}),
    ...(input.uploadSessionId
      ? { uploadSessionId: input.uploadSessionId }
      : {}),
    ...(input.multipartUploadId
      ? { multipartUploadId: input.multipartUploadId }
      : {}),
  };
  try {
    await executor
      .insert(fileLifecycleJobs)
      .values({
        kind: input.kind,
        state: "pending",
        priority: input.priority ?? 100,
        projectId: input.projectId ?? null,
        environmentId: input.environmentId ?? null,
        fileKeyId: input.fileKeyId ?? null,
        fileId: input.fileId ?? null,
        adapterData: Object.keys(adapterData).length > 0 ? adapterData : null,
        idempotencyKey,
        maxAttempts: input.maxAttempts ?? 10,
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
      })
      .onConflictDoUpdate({
        target: fileLifecycleJobs.idempotencyKey,
        set: {
          state: sql`case
            when ${fileLifecycleJobs.state} = 'done' then ${fileLifecycleJobs.state}
            else 'pending'
          end`,
          nextAttemptAt: sql`least(${fileLifecycleJobs.nextAttemptAt}, excluded.next_attempt_at)`,
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: sql`now()`,
        },
      });
  } catch (error) {
    console.error("Failed to enqueue lifecycle job", {
      kind: input.kind,
      idempotencyKey,
      fileKeyId: input.fileKeyId,
      fileId: input.fileId,
      storageKey: input.storageKey,
      uploadSessionId: input.uploadSessionId,
      error,
    });
    throw error;
  }
}

export async function enqueueDeleteObjectJob(
  executor: JobExecutor,
  input: Omit<EnqueueLifecycleJobInput, "kind"> & { storageKey: string },
): Promise<void> {
  await enqueueLifecycleJob(executor, {
    ...input,
    kind: "delete_object",
    idempotencyKey:
      input.idempotencyKey ??
      `delete_object:${input.projectId ?? "-"}:${input.fileKeyId ?? "-"}:${input.fileId ?? "-"}:${input.storageKey}`,
  });
}

function getLifecycleJobAdapterData(
  adapterData: unknown,
): LifecycleJobAdapterData {
  if (
    !adapterData ||
    typeof adapterData !== "object" ||
    Array.isArray(adapterData)
  ) {
    return {};
  }

  const data = adapterData as Record<string, unknown>;
  return {
    storageKey:
      typeof data.storageKey === "string" ? data.storageKey : undefined,
    uploadSessionId:
      typeof data.uploadSessionId === "string"
        ? data.uploadSessionId
        : undefined,
    multipartUploadId:
      typeof data.multipartUploadId === "string"
        ? data.multipartUploadId
        : undefined,
  };
}

export async function enqueueAbortMultipartJob(
  executor: JobExecutor,
  input: Omit<EnqueueLifecycleJobInput, "kind"> & {
    uploadSessionId: string;
    projectId: string;
  },
): Promise<void> {
  await enqueueLifecycleJob(executor, {
    ...input,
    kind: "abort_multipart",
    idempotencyKey:
      input.idempotencyKey ??
      `abort_multipart:${input.projectId}:${input.uploadSessionId}`,
  });
}

export async function enqueueFinalizeFailedFileKeyJob(
  executor: JobExecutor,
  input: Omit<EnqueueLifecycleJobInput, "kind"> & {
    fileKeyId: string;
    fileId?: string | null;
  },
): Promise<void> {
  await enqueueLifecycleJob(executor, {
    ...input,
    kind: "finalize_failed_filekey",
    idempotencyKey:
      input.idempotencyKey ??
      `finalize_failed_filekey:${input.projectId ?? "-"}:${input.fileKeyId}:${input.fileId ?? "-"}`,
  });
}

async function claimLifecycleJobs(db: Db, options: ClaimOptions) {
  const now = new Date();
  const limit = options.limit ?? 50;
  const leaseSeconds = options.leaseSeconds ?? 60;
  const leaseOwner =
    options.leaseOwner ??
    `runner:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;

  const candidates = await db
    .select({ id: fileLifecycleJobs.id })
    .from(fileLifecycleJobs)
    .where(
      and(
        or(
          eq(fileLifecycleJobs.state, "pending"),
          eq(fileLifecycleJobs.state, "retry"),
        ),
        lte(fileLifecycleJobs.nextAttemptAt, now),
        or(
          isNull(fileLifecycleJobs.leaseExpiresAt),
          lte(fileLifecycleJobs.leaseExpiresAt, now),
        ),
      ),
    )
    .orderBy(
      desc(fileLifecycleJobs.priority),
      asc(fileLifecycleJobs.nextAttemptAt),
    )
    .limit(limit);

  const ids = candidates.map((candidate) => candidate.id);
  if (ids.length === 0) return [];

  const claimed = await db
    .update(fileLifecycleJobs)
    .set({
      state: "leased",
      leaseOwner,
      leaseExpiresAt: sql`now() + (${leaseSeconds} * interval '1 second')`,
    })
    .where(
      and(
        inArray(fileLifecycleJobs.id, ids),
        or(
          eq(fileLifecycleJobs.state, "pending"),
          eq(fileLifecycleJobs.state, "retry"),
        ),
        lte(fileLifecycleJobs.nextAttemptAt, now),
        or(
          isNull(fileLifecycleJobs.leaseExpiresAt),
          lte(fileLifecycleJobs.leaseExpiresAt, now),
        ),
      ),
    )
    .returning();

  return claimed;
}

export async function requeueDeadLifecycleJobs(
  db: Db,
  options: RequeueDeadOptions = {},
): Promise<{
  selected: number;
  requeued: number;
}> {
  const limit = options.limit ?? 100;
  const kinds = options.kinds ?? ["delete_object", "abort_multipart"];

  const candidates = await db
    .select({ id: fileLifecycleJobs.id })
    .from(fileLifecycleJobs)
    .where(
      and(
        eq(fileLifecycleJobs.state, "dead"),
        inArray(fileLifecycleJobs.kind, kinds),
        or(
          inArray(fileLifecycleJobs.lastHttpStatus, [
            ...Array.from(RETRYABLE_STATUS_CODES),
          ]),
          eq(fileLifecycleJobs.lastErrorCode, "job_exception"),
        ),
      ),
    )
    .orderBy(asc(fileLifecycleJobs.deadAt), asc(fileLifecycleJobs.updatedAt))
    .limit(limit);

  const ids = candidates.map((candidate) => candidate.id);
  if (ids.length === 0) {
    return { selected: 0, requeued: 0 };
  }

  const requeued = await db
    .update(fileLifecycleJobs)
    .set({
      state: "retry",
      nextAttemptAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      deadAt: null,
    })
    .where(inArray(fileLifecycleJobs.id, ids))
    .returning({ id: fileLifecycleJobs.id });

  return {
    selected: ids.length,
    requeued: requeued.length,
  };
}

async function markJobDone(db: Db, jobId: string): Promise<void> {
  await db
    .update(fileLifecycleJobs)
    .set({
      state: "done",
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
      lastError: null,
      lastHttpStatus: null,
      lastErrorCode: null,
    })
    .where(eq(fileLifecycleJobs.id, jobId));
}

async function markJobFailed(
  db: Db,
  job: typeof fileLifecycleJobs.$inferSelect,
  failure: {
    message: string;
    httpStatus?: number;
    errorCode?: string;
    retryable: boolean;
  },
): Promise<void> {
  const nextAttemptCount = job.attemptCount + 1;
  const shouldRetry = failure.retryable;
  const reachedMaxAttempts = nextAttemptCount >= job.maxAttempts;
  const cleanupKindRetriesForever = ALWAYS_RETRY_CLEANUP_KINDS.has(
    job.kind as LifecycleJobKind,
  );
  const willRetry =
    shouldRetry && (cleanupKindRetriesForever || !reachedMaxAttempts);
  const nextAttemptAt = willRetry
    ? new Date(Date.now() + nextBackoffMs(nextAttemptCount))
    : null;

  await db
    .update(fileLifecycleJobs)
    .set({
      state: willRetry ? "retry" : "dead",
      attemptCount: nextAttemptCount,
      nextAttemptAt: nextAttemptAt ?? job.nextAttemptAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: failure.message.slice(0, 4000),
      lastHttpStatus: failure.httpStatus ?? null,
      lastErrorCode: failure.errorCode ?? null,
      deadAt: willRetry ? null : new Date(),
    })
    .where(eq(fileLifecycleJobs.id, job.id));
}

async function performDeleteObject(job: typeof fileLifecycleJobs.$inferSelect) {
  const adapterData = getLifecycleJobAdapterData(job.adapterData);
  if (!adapterData.storageKey) {
    return {
      ok: false as const,
      retryable: false,
      errorCode: "missing_storage_key",
      message: "Lifecycle job missing storageKey",
    };
  }

  const response = await fetch(
    `${env.WORKER_URL}/internal/delete/${encodeURIComponent(adapterData.storageKey)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.CALLBACK_SECRET}`,
      },
    },
  );

  if (response.ok) {
    return { ok: true as const };
  }

  const details = await response.text().catch(() => "");
  const retryable = RETRYABLE_STATUS_CODES.has(response.status);

  return {
    ok: false as const,
    retryable,
    httpStatus: response.status,
    errorCode: "delete_object_failed",
    message: `Delete object failed (${response.status}): ${details || response.statusText}`,
  };
}

async function performAbortMultipart(
  job: typeof fileLifecycleJobs.$inferSelect,
) {
  const adapterData = getLifecycleJobAdapterData(job.adapterData);

  const hasDoPath = !!adapterData.uploadSessionId && !!job.projectId;
  const hasFallbackPath =
    !!adapterData.storageKey && !!adapterData.multipartUploadId;

  if (!hasDoPath && !hasFallbackPath) {
    return {
      ok: false as const,
      retryable: false,
      errorCode: "missing_upload_session",
      message:
        "Abort multipart job missing both DO and fallback multipart identifiers",
    };
  }

  let doStatus = 0;
  if (hasDoPath) {
    const response = await fetch(
      `${env.WORKER_URL}/internal/tus/${adapterData.uploadSessionId}/delete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CALLBACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId: job.projectId }),
      },
    );

    doStatus = response.status;

    if (!response.ok && response.status !== 404) {
      const details = await response.text().catch(() => "");
      const retryable = RETRYABLE_STATUS_CODES.has(response.status);

      return {
        ok: false as const,
        retryable,
        httpStatus: response.status,
        errorCode: "abort_multipart_failed",
        message: `Abort multipart failed (${response.status}): ${details || response.statusText}`,
      };
    }
  }

  const shouldUseFallback =
    hasFallbackPath && (!hasDoPath || doStatus === 404 || doStatus === 0);

  if (shouldUseFallback) {
    const fallbackAbortResponse = await fetch(
      `${env.WORKER_URL}/internal/multipart/abort`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CALLBACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storageKey: adapterData.storageKey,
          uploadId: adapterData.multipartUploadId,
        }),
      },
    );

    if (!fallbackAbortResponse.ok) {
      const fallbackDetails = await fallbackAbortResponse
        .text()
        .catch(() => "");
      const retryable = RETRYABLE_STATUS_CODES.has(
        fallbackAbortResponse.status,
      );

      return {
        ok: false as const,
        retryable,
        httpStatus: fallbackAbortResponse.status,
        errorCode: "abort_multipart_fallback_failed",
        message: `Fallback multipart abort failed (${fallbackAbortResponse.status}): ${fallbackDetails || fallbackAbortResponse.statusText}`,
      };
    }
  }

  if (adapterData.storageKey) {
    const deleteResult = await performDeleteObject(job);
    if (!deleteResult.ok) {
      return deleteResult;
    }
  }

  return { ok: true as const };
}

async function performFinalizeFailedFileKey(
  db: Db,
  job: typeof fileLifecycleJobs.$inferSelect,
) {
  if (job.fileId || job.fileKeyId) {
    const blockingCleanupJobs = await db
      .select({
        id: fileLifecycleJobs.id,
        state: fileLifecycleJobs.state,
      })
      .from(fileLifecycleJobs)
      .where(
        and(
          inArray(fileLifecycleJobs.kind, ["delete_object", "abort_multipart"]),
          inArray(fileLifecycleJobs.state, [
            "pending",
            "retry",
            "leased",
            "dead",
          ]),
          or(
            job.fileId ? eq(fileLifecycleJobs.fileId, job.fileId) : undefined,
            job.fileKeyId
              ? eq(fileLifecycleJobs.fileKeyId, job.fileKeyId)
              : undefined,
          ),
        ),
      )
      .limit(1);

    if (blockingCleanupJobs.length > 0) {
      return {
        ok: false as const,
        retryable: true,
        httpStatus: undefined,
        errorCode: "storage_cleanup_incomplete",
        message:
          "Finalize failed file key deferred until storage cleanup completes",
      };
    }
  }

  if (job.fileId) {
    await db.delete(files).where(eq(files.id, job.fileId));
  }

  return { ok: true as const };
}

async function performRepairMissingObject(
  db: Db,
  job: typeof fileLifecycleJobs.$inferSelect,
) {
  await db.transaction(async (tx) => {
    if (job.fileKeyId) {
      const currentFileKey = await tx.query.fileKeys.findFirst({
        where: eq(fileKeys.id, job.fileKeyId),
        columns: { adapterData: true },
      });

      await tx
        .update(fileKeys)
        .set({
          status: "failed",
          uploadFailedAt: new Date(),
          adapterData: clearUploadSessionAdapterData(
            currentFileKey?.adapterData,
          ),
          fileId: null,
        })
        .where(eq(fileKeys.id, job.fileKeyId));
    }

    if (job.fileId) {
      await tx.delete(files).where(eq(files.id, job.fileId));
    }
  });

  return { ok: true as const };
}

async function executeLifecycleJob(
  db: Db,
  job: typeof fileLifecycleJobs.$inferSelect,
): Promise<LifecycleJobExecutionResult> {
  try {
    switch (job.kind) {
      case "delete_object":
        return await performDeleteObject(job);
      case "abort_multipart":
        return await performAbortMultipart(job);
      case "finalize_failed_filekey":
        return await performFinalizeFailedFileKey(db, job);
      case "repair_missing_object":
        return await performRepairMissingObject(db, job);
      default:
        return {
          ok: false,
          retryable: false,
          errorCode: "unknown_job_kind",
          message: `Unknown lifecycle job kind: ${job.kind}`,
        };
    }
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      errorCode: "job_exception",
      message: error instanceof Error ? error.message : "Unknown job exception",
    };
  }
}

export async function runLifecycleJobBatch(
  db: Db,
  options: ClaimOptions = {},
): Promise<{
  claimed: number;
  completed: number;
  retried: number;
  dead: number;
}> {
  const claimedJobs = await claimLifecycleJobs(db, options);

  let completed = 0;
  let retried = 0;
  let dead = 0;

  for (const job of claimedJobs) {
    const outcome = await executeLifecycleJob(db, job);

    if (outcome.ok) {
      await markJobDone(db, job.id);
      completed += 1;
      continue;
    }

    await markJobFailed(db, job, {
      message: outcome.message,
      httpStatus: outcome.httpStatus,
      errorCode: outcome.errorCode,
      retryable: outcome.retryable,
    });

    if (outcome.retryable) {
      retried += 1;
    } else {
      dead += 1;
    }
  }

  return {
    claimed: claimedJobs.length,
    completed,
    retried,
    dead,
  };
}
