import type { QueuedWebhookMessage } from "@silo-storage/api/runtime";

export interface CompletionObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface CompletionObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): CompletionObjectStub;
}

export interface HyperdriveBinding {
  connectionString: string;
}

export interface QueueBinding<T> {
  send(message: T): Promise<void>;
}

declare global {
  interface CloudflareEnv {
    COMPLETION_DO: CompletionObjectNamespace;
    HYPERDRIVE: HyperdriveBinding;
    WEBHOOK_QUEUE: QueueBinding<QueuedWebhookMessage>;
  }
}

export {};
