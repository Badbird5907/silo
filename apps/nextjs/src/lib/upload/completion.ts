import { asyncWaitForMessage, publishMessage, redis } from "@silo-storage/redis";
import { z } from "zod";

const DEFAULT_COMPLETION_NAMESPACE = "default";
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

function resolveCompletionNamespace(namespace?: string): string {
  return namespace ?? DEFAULT_COMPLETION_NAMESPACE;
}

function completionKey(fileKeyId: string, namespace?: string): string {
  return `completion:${resolveCompletionNamespace(namespace)}:fileKey:${fileKeyId}`;
}

function completionChannel(fileKeyId: string, namespace?: string): string {
  return `completion:${resolveCompletionNamespace(namespace)}:fileKey:${fileKeyId}`;
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
  namespace?: string;
}): Promise<CompletionRecord> {
  const ttlSeconds = Math.max(
    1,
    Math.floor(input.ttlSeconds ?? DEFAULT_COMPLETION_TTL_SECONDS),
  );
  const namespace = resolveCompletionNamespace(input.namespace);

  const record = completionRecordSchema.parse({
    contractVersion: input.completion.contractVersion ?? 1,
    source: input.completion.source,
    routeSlug: input.completion.routeSlug,
    fileKeyId: input.fileKeyId,
    completedAt: input.completion.completedAt ?? Date.now(),
    onUploadCompleteResult: input.completion.onUploadCompleteResult,
  });

  await redis.set(completionKey(input.fileKeyId, namespace), JSON.stringify(record), {
    ex: ttlSeconds,
  });
  const persisted = await redis.get<string | null>(
    completionKey(input.fileKeyId, namespace),
  );
  logCompletionDebug("set.persisted", {
    fileKeyId: input.fileKeyId,
    namespace,
    ttlSeconds,
    persisted: Boolean(persisted),
  });
  await publishMessage(completionChannel(input.fileKeyId, namespace), {
    type: "completion.ready",
    fileKeyId: input.fileKeyId,
    completedAt: record.completedAt,
  });
  logCompletionDebug("set.published", {
    fileKeyId: input.fileKeyId,
    namespace,
  });

  return record;
}

export async function getCompletionRecord(
  fileKeyId: string,
  namespace?: string,
): Promise<CompletionRecord | null> {
  const resolvedNamespace = resolveCompletionNamespace(namespace);
  const raw = await redis.get<unknown>(completionKey(fileKeyId, resolvedNamespace));
  if (raw == null) {
    logCompletionDebug("get.miss", { fileKeyId, namespace: resolvedNamespace });
    return null;
  }

  if (typeof raw !== "string") {
    try {
      const parsed = completionRecordSchema.parse(raw);
      logCompletionDebug("get.hit", {
        fileKeyId,
        namespace: resolvedNamespace,
        completedAt: parsed.completedAt,
      });
      return parsed;
    } catch {
      logCompletionDebug("get.parse_error", {
        fileKeyId,
        namespace: resolvedNamespace,
      });
      return null;
    }
  }

  try {
    const parsed = completionRecordSchema.parse(JSON.parse(raw));
    logCompletionDebug("get.hit", {
      fileKeyId,
      namespace: resolvedNamespace,
      completedAt: parsed.completedAt,
    });
    return parsed;
  } catch {
    logCompletionDebug("get.parse_error", {
      fileKeyId,
      namespace: resolvedNamespace,
    });
    return null;
  }
}

export async function waitForCompletionRecord(
  fileKeyId: string,
  timeoutMs: number,
  namespace?: string,
): Promise<CompletionRecord | null> {
  const startedAt = Date.now();
  const resolvedNamespace = resolveCompletionNamespace(namespace);
  logCompletionDebug("wait.start", {
    fileKeyId,
    namespace: resolvedNamespace,
    timeoutMs,
  });
  const first = await getCompletionRecord(fileKeyId, resolvedNamespace);
  if (first) {
    logCompletionDebug("wait.fast_hit", {
      fileKeyId,
      namespace: resolvedNamespace,
      elapsedMs: Date.now() - startedAt,
    });
    return first;
  }

  while (Date.now() - startedAt <= timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;

    try {
      await asyncWaitForMessage(
        completionChannel(fileKeyId, resolvedNamespace),
        Math.min(25_000, remainingMs),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown wait error";
      if (!message.includes("Timeout waiting for message")) {
        throw error;
      }
    }

    const current = await getCompletionRecord(fileKeyId, resolvedNamespace);
    if (current) {
      logCompletionDebug("wait.hit_after_subscribe", {
        fileKeyId,
        namespace: resolvedNamespace,
        elapsedMs: Date.now() - startedAt,
      });
      return current;
    }
  }

  logCompletionDebug("wait.timeout", {
    fileKeyId,
    namespace: resolvedNamespace,
    elapsedMs: Date.now() - startedAt,
  });
  return null;
}
