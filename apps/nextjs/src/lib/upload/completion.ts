import { z } from "zod";

import {
  getStateValue,
  setStateValue,
  waitForStateValue,
} from "@/cloudflare/state";

const DEFAULT_COMPLETION_NAMESPACE = "default";
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

function completionKey(fileKeyId: string, namespace?: string): string {
  return `completion:${namespace ?? DEFAULT_COMPLETION_NAMESPACE}:fileKey:${fileKeyId}`;
}

export async function setCompletionRecord(input: {
  fileKeyId: string;
  completion: Partial<CompletionRecord> & { onUploadCompleteResult: unknown };
  ttlSeconds?: number;
  namespace?: string;
}): Promise<CompletionRecord> {
  const record = completionRecordSchema.parse({
    contractVersion: input.completion.contractVersion ?? 1,
    source: input.completion.source,
    routeSlug: input.completion.routeSlug,
    fileKeyId: input.fileKeyId,
    completedAt: input.completion.completedAt ?? Date.now(),
    onUploadCompleteResult: input.completion.onUploadCompleteResult,
  });
  await setStateValue(
    completionKey(input.fileKeyId, input.namespace),
    record,
    input.ttlSeconds ?? DEFAULT_COMPLETION_TTL_SECONDS,
  );
  return record;
}

export async function getCompletionRecord(
  fileKeyId: string,
  namespace?: string,
): Promise<CompletionRecord | null> {
  const value = await getStateValue<unknown>(
    completionKey(fileKeyId, namespace),
  );
  const parsed = completionRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function waitForCompletionRecord(
  fileKeyId: string,
  timeoutMs: number,
  namespace?: string,
): Promise<CompletionRecord | null> {
  const key = completionKey(fileKeyId, namespace);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await waitForStateValue<unknown>(
      key,
      Math.min(25_000, deadline - Date.now()),
    );
    const parsed = completionRecordSchema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return null;
}
