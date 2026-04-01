import { asyncWaitForMessage, publishMessage, redis } from "@silo-storage/redis";
import { z } from "zod";

const COMPLETION_KEY_PREFIX = "completion:fileKey:";
const COMPLETION_CHANNEL_PREFIX = "completion:fileKey:";
const DEFAULT_COMPLETION_TTL_SECONDS = 25 * 60;

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
  await publishMessage(completionChannel(input.fileKeyId), {
    type: "completion.ready",
    fileKeyId: input.fileKeyId,
    completedAt: record.completedAt,
  });

  return record;
}

export async function getCompletionRecord(
  fileKeyId: string,
): Promise<CompletionRecord | null> {
  const raw = await redis.get<string | null>(completionKey(fileKeyId));
  if (!raw || typeof raw !== "string") return null;

  try {
    return completionRecordSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function waitForCompletionRecord(
  fileKeyId: string,
  timeoutMs: number,
): Promise<CompletionRecord | null> {
  const first = await getCompletionRecord(fileKeyId);
  if (first) return first;

  const startedAt = Date.now();
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
    if (current) return current;
  }

  return null;
}
