import type { UploadEventEnvelope } from "@silo-storage/shared";

export interface QueuedWebhookMessage {
  idempotencyKey: string;
  environmentId: string;
  projectId: string;
  maxAttempts?: number;
  event: UploadEventEnvelope;
}

interface SiloApiRuntime {
  sendWebhook?: (message: QueuedWebhookMessage) => Promise<void>;
  publishUploadEvent?: (
    fileKeyId: string,
    event: UploadEventEnvelope,
  ) => Promise<void>;
}

const runtimeKey = Symbol.for("silo.api.runtime");

function getRuntime(): SiloApiRuntime {
  const root = globalThis as typeof globalThis & {
    [runtimeKey]?: SiloApiRuntime;
  };
  return (root[runtimeKey] ??= {});
}

export function configureApiRuntime(runtime: SiloApiRuntime): void {
  Object.assign(getRuntime(), runtime);
}

export async function sendWebhookMessage(
  message: QueuedWebhookMessage,
): Promise<boolean> {
  const sender = getRuntime().sendWebhook;
  if (sender) {
    await sender(message);
    return true;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Cloudflare webhook queue binding is not configured");
  }

  console.warn("Webhook delivery skipped because no local queue is configured");
  return false;
}

export async function publishUploadEvent(
  fileKeyId: string,
  event: UploadEventEnvelope,
): Promise<void> {
  const publisher = getRuntime().publishUploadEvent;
  if (publisher) {
    await publisher(fileKeyId, event);
  }
}
