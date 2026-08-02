import type { UploadEventEnvelope } from "@silo-storage/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { CompletionObjectStub } from "./bindings";

const UPLOAD_EVENT_TTL_SECONDS = 5 * 60;

async function getStub(key: string): Promise<CompletionObjectStub> {
  const { env } = await getCloudflareContext({ async: true });
  const id = env.COMPLETION_DO.idFromName(key);
  return env.COMPLETION_DO.get(id);
}

export async function setStateValueWithNamespace(
  namespace: CloudflareEnv["COMPLETION_DO"],
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const response = await namespace
    .get(namespace.idFromName(key))
    .fetch("https://completion.internal/value", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Silo-TTL-Seconds": String(Math.max(1, Math.floor(ttlSeconds))),
      },
      body: JSON.stringify(value),
    });
  if (!response.ok) {
    throw new Error(`Failed to persist Cloudflare state (${response.status})`);
  }
}

export async function setStateValue(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const { env } = await getCloudflareContext({ async: true });
  await setStateValueWithNamespace(env.COMPLETION_DO, key, value, ttlSeconds);
}

export async function getStateValue<T>(key: string): Promise<T | null> {
  const response = await (
    await getStub(key)
  ).fetch("https://completion.internal/value");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to read Cloudflare state (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function waitForStateValue<T>(
  key: string,
  timeoutMs: number,
): Promise<T | null> {
  const url = new URL("https://completion.internal/wait");
  url.searchParams.set("timeoutMs", String(Math.max(1, timeoutMs)));
  const response = await (await getStub(key)).fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed waiting for Cloudflare state (${response.status})`);
  }
  return (await response.json()) as T;
}

export function uploadEventKey(fileKeyId: string): string {
  return `upload-event:${fileKeyId}`;
}

export async function publishUploadState(
  fileKeyId: string,
  event: UploadEventEnvelope,
): Promise<void> {
  await setStateValue(
    uploadEventKey(fileKeyId),
    event,
    UPLOAD_EVENT_TTL_SECONDS,
  );
}

export async function waitForUploadState(
  fileKeyId: string,
  timeoutMs: number,
): Promise<UploadEventEnvelope | null> {
  return waitForStateValue<UploadEventEnvelope>(
    uploadEventKey(fileKeyId),
    timeoutMs,
  );
}
