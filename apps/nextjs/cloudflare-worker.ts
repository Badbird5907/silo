import type { QueuedWebhookMessage } from "@silo-storage/api/runtime";

import { configureApiRuntime } from "@silo-storage/api/runtime";
import { purgeExpiredRetentionRecords } from "@silo-storage/api/service/retention";
import { configureDatabaseRuntime, db } from "@silo-storage/db/client";

import openNextWorker from "./.open-next/worker.js";
import { CompletionDurableObject } from "./src/cloudflare/completion-durable-object";
import { setStateValueWithNamespace } from "./src/cloudflare/state";
import { deliverQueuedWebhookMessage } from "./src/lib/webhooks/delivery";

interface WorkerEnv extends CloudflareEnv {
  SIGNING_SECRET: string;
  WEBHOOK_DELIVERY_ENABLED: string;
}

interface QueueMessage<T> {
  id: string;
  attempts: number;
  body: T;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface QueueBatch<T> {
  messages: QueueMessage<T>[];
}

function configureRuntime(env: WorkerEnv): void {
  configureDatabaseRuntime(env.HYPERDRIVE.connectionString);
  configureApiRuntime({
    sendWebhook: (message) => env.WEBHOOK_QUEUE.send(message),
    publishUploadEvent: (fileKeyId, event) =>
      setStateValueWithNamespace(
        env.COMPLETION_DO,
        `upload-event:${fileKeyId}`,
        event,
        5 * 60,
      ),
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    configureRuntime(env);
    return openNextWorker.fetch(request, env, ctx);
  },

  async queue(batch: QueueBatch<QueuedWebhookMessage>, env: WorkerEnv) {
    configureRuntime(env);
    for (const message of batch.messages) {
      try {
        const result = await deliverQueuedWebhookMessage(message.body, {
          queueMessageId: `${message.id}:${message.attempts}`,
          signingSecret: env.SIGNING_SECRET,
          enabled: env.WEBHOOK_DELIVERY_ENABLED !== "false",
        });
        if (result.retry) {
          message.retry({
            delaySeconds: Math.min(
              3600,
              10 * 2 ** Math.max(0, message.attempts - 1),
            ),
          });
        } else {
          message.ack();
        }
      } catch (error) {
        console.error("Cloudflare webhook queue delivery failed", {
          messageId: message.id,
          attempts: message.attempts,
          error,
        });
        message.retry({ delaySeconds: 30 });
      }
    }
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv) {
    configureRuntime(env);
    const result = await purgeExpiredRetentionRecords(db);
    console.info("Purged expired retention records", result);
  },
};

export { CompletionDurableObject };
