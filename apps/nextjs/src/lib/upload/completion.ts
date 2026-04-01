import { asyncWaitForMessage, publishMessage, redis } from "@silo-storage/redis";
import { z } from "zod";

const COMPLETION_KEY_PREFIX = "completion:fileKey:";
const COMPLETION_CHANNEL_PREFIX = "completion:fileKey:";
const DEFAULT_COMPLETION_TTL_SECONDS = 25 * 60;
const COMPLETION_DEBUG_ENABLED =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.SILO_COMPLETION_DEBUG === "1";

const completionRecordSchema = z
  .object({
    contractVersion: z.number().int().positive().default(1),
    source: z.string().optional(),
    routeSlug: z.string().optional(),
    fileKeyId: z.string().min(1),
    completedAt: z.number().int().positive(),
    onUploadCompleteResult: z.unknown(),
  })
  .catchall(z.unknown());

export type CompletionRecord = z.infer<typeof completionRecordSchema>;

function completionKey(fileKeyId: string): string {
  return `${COMPLETION_KEY_PREFIX}${fileKeyId}`;
}

function completionChannel(fileKeyId: string): string {
  return `${COMPLETION_CHANNEL_PREFIX}${fileKeyId}`;
}

function logCompletionDebug(event: string, details: Record<string, unknown>) {
  if (!COMPLETION_DEBUG_ENABLED) return;
  console.info("[silo-completion-store]", {
    event,
    ...details,
  });
}

export async function setCompletionRecord(input: {
  fileKeyId: string;
  completion: Partial<CompletionRecord> & {
    onUploadCompleteResult: unknown;
  };
  ttlSeconds?: number;
}): Promise<CompletionRecord> {
  const ttlSeconds = Math.max(
    1,
    Math.floor(input.ttlSeconds ?? DEFAULT_COMPLETION_TTL_SECONDS),
  );

  const record = completionRecordSchema.parse({
    contractVersion: input.completion.contractVersion ?? 1,
    source: input.completion.source,
    routeSlug: input.completion.routeSlug,
    fileKeyId: input.fileKeyId,
    completedAt: input.completion.completedAt ?? Date.now(),
    onUploadCompleteResult: input.completion.onUploadCompleteResult,
  });

  await redis.set(completionKey(input.fileKeyId), JSON.stringify(record), {
    ex: ttlSeconds,
  });
  const persisted = await redis.get<string | null>(completionKey(input.fileKeyId));
  logCompletionDebug("set.persisted", {
    fileKeyId: input.fileKeyId,
    ttlSeconds,
    persisted: Boolean(persisted),
  });
  await publishMessage(completionChannel(input.fileKeyId), {
    type: "completion.ready",
    fileKeyId: input.fileKeyId,
    completedAt: record.completedAt,
  });
  logCompletionDebug("set.published", {
    fileKeyId: input.fileKeyId,
  });

  return record;
}

export async function getCompletionRecord(
  fileKeyId: string,
): Promise<CompletionRecord | null> {
  const raw = await redis.get<string | null>(completionKey(fileKeyId));
  if (!raw || typeof raw !== "string") {
    logCompletionDebug("get.miss", { fileKeyId });
    return null;
  }

  try {
    const parsed = completionRecordSchema.parse(JSON.parse(raw));
    logCompletionDebug("get.hit", {
      fileKeyId,
      completedAt: parsed.completedAt,
    });
    return parsed;
  } catch {
    logCompletionDebug("get.parse_error", { fileKeyId });
    return null;
  }
}

export async function waitForCompletionRecord(
  fileKeyId: string,
  timeoutMs: number,
): Promise<CompletionRecord | null> {
  const startedAt = Date.now();
  logCompletionDebug("wait.start", { fileKeyId, timeoutMs });
  const first = await getCompletionRecord(fileKeyId);
  if (first) {
    logCompletionDebug("wait.fast_hit", {
      fileKeyId,
      elapsedMs: Date.now() - startedAt,
    });
    return first;
  }

  while (Date.now() - startedAt <= timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;

    try {
      await asyncWaitForMessage(
        completionChannel(fileKeyId),
        Math.min(25_000, remainingMs),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown wait error";
      if (!message.includes("Timeout waiting for message")) {
        throw error;
      }
    }

    const current = await getCompletionRecord(fileKeyId);
    if (current) {
      logCompletionDebug("wait.hit_after_subscribe", {
        fileKeyId,
        elapsedMs: Date.now() - startedAt,
      });
      return current;
    }
  }

  logCompletionDebug("wait.timeout", {
    fileKeyId,
    elapsedMs: Date.now() - startedAt,
  });
  return null;
}
