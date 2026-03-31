import {
  deriveSigningSecretFromApiKeyHash,
  getFileCallbackTargetForEvent,
  getLatestCallbackAttempt,
  getLatestWebhookAttempt,
  getNextAttemptNumber,
  getNextCallbackAttemptNumber,
  getWebhookTargetForEvent,
  normalizeEnvironmentCallbackHeaders,
  recordCallbackAttempt,
  webhookAttempt,
  shouldRetryAttempt,
  signWebhookPayload,
} from "@silo-storage/api/services";
import { eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { apiKeys, projectEnvironments } from "@silo-storage/db/schema";
import { handleCallback } from "@vercel/queue";
import { queuedWebhookMessageSchema } from "@silo-storage/api/services";

import { env } from "@/env";

interface QueueMetadata {
  messageId?: string;
}

function shouldAttemptDelivery(lastStatus: string | null | undefined): boolean {
  return !lastStatus || lastStatus === "retry";
}

type DeliveryAttemptStatus = "success" | "retry" | "failed";

interface DeliveryAttemptWrite {
  attemptNumber: number;
  status: DeliveryAttemptStatus;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  latencyMs: number;
}

type SecretResolution =
  | { secret: string }
  | { error: string };

interface DeliveryChannel {
  url: string;
  payload: string;
  getLatestStatus: () => Promise<string | null | undefined>;
  getNextAttemptNumber: () => Promise<number>;
  resolveSecret: () => Promise<SecretResolution>;
  recordAttempt: (input: DeliveryAttemptWrite) => Promise<void>;
}

async function deliverChannel(
  channel: DeliveryChannel,
  input: {
    maxAttempts: number;
    commonHeaders: Record<string, string>;
    environmentCallbackHeaders: Record<string, string>;
  },
) {
  const latestStatus = await channel.getLatestStatus();
  if (!shouldAttemptDelivery(latestStatus)) {
    return false;
  }

  const startedAt = Date.now();
  const attemptNumber = await channel.getNextAttemptNumber();

  try {
    const resolvedSecret = await channel.resolveSecret();
    if ("error" in resolvedSecret) {
      await channel.recordAttempt({
        attemptNumber,
        status: "failed",
        error: resolvedSecret.error,
        latencyMs: Date.now() - startedAt,
      });
      return false;
    }

    const signed = await signWebhookPayload(channel.payload, resolvedSecret.secret);
    const response = await fetch(channel.url, {
      method: "POST",
      headers: {
        ...input.commonHeaders,
        ...input.environmentCallbackHeaders,
        "X-Silo-Signature": signed.signature,
        "X-Silo-Timestamp": String(signed.timestamp),
      },
      body: channel.payload,
    });

    const responseBody = (await response.text().catch(() => "")).slice(0, 2000);
    const latencyMs = Date.now() - startedAt;
    if (response.ok) {
      await channel.recordAttempt({
        attemptNumber,
        status: "success",
        responseStatus: response.status,
        responseBody,
        latencyMs,
      });
      return false;
    }

    const retry = shouldRetryAttempt(attemptNumber, input.maxAttempts, response.status);
    await channel.recordAttempt({
      attemptNumber,
      status: retry ? "retry" : "failed",
      responseStatus: response.status,
      responseBody,
      error: `HTTP ${response.status}`,
      latencyMs,
    });
    return retry;
  } catch (error) {
    const retry = shouldRetryAttempt(attemptNumber, input.maxAttempts);
    await channel.recordAttempt({
      attemptNumber,
      status: retry ? "retry" : "failed",
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    });
    return retry;
  }
}

export const POST = handleCallback(async (rawQueueMessage, metadata) => {
  const parsed = queuedWebhookMessageSchema.safeParse(rawQueueMessage);
  if (!parsed.success) {
    throw new Error("Invalid webhook queue message payload");
  }
  const queueMessage = parsed.data;
  const queueMetadata = metadata as QueueMetadata | undefined;

  if (!env.WEBHOOK_DELIVERY_ENABLED) {
    return;
  }

  const maxAttempts = queueMessage.maxAttempts ?? 8;
  const webhookPayload = JSON.stringify(queueMessage.event);
  const commonHeaders = {
    "Content-Type": "application/json",
    "User-Agent": "silo-webhooks/1.0",
    "X-Silo-Webhook-Id": queueMessage.idempotencyKey,
    "X-Silo-Event-Type": queueMessage.event.type,
    "X-Silo-Event-Version": String(queueMessage.event.version),
  };
  const webhookTarget = await getWebhookTargetForEvent(db, {
    environmentId: queueMessage.environmentId,
    eventType: queueMessage.event.type,
  });
  const callbackTarget = await getFileCallbackTargetForEvent(db, {
    projectId: queueMessage.projectId,
    eventData: queueMessage.event.data,
  });

  const environmentRow = await db.query.projectEnvironments.findFirst({
    where: eq(projectEnvironments.id, queueMessage.environmentId),
    columns: { callbackHeaders: true },
  });
  const environmentCallbackHeaders = normalizeEnvironmentCallbackHeaders(
    environmentRow?.callbackHeaders,
  );

  const sharedAttemptFields = {
    eventId: queueMessage.event.id,
    idempotencyKey: queueMessage.idempotencyKey,
    queueMessageId: queueMetadata?.messageId,
    environmentId: queueMessage.environmentId,
    projectId: queueMessage.projectId,
  };

  const channels: DeliveryChannel[] = [];

  const webhookUrl = webhookTarget?.webhookUrl;
  const webhookSecret = webhookTarget?.webhookSecret;
  if (webhookUrl && webhookSecret) {
    channels.push({
      url: webhookUrl,
      payload: webhookPayload,
      getLatestStatus: async () =>
        (await getLatestWebhookAttempt(db, queueMessage.event.id))?.status,
      getNextAttemptNumber: async () =>
        getNextAttemptNumber(db, queueMessage.event.id),
      resolveSecret: () => Promise.resolve({ secret: webhookSecret }),
      recordAttempt: async (attempt) =>
        webhookAttempt(db, {
          ...sharedAttemptFields,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          requestUrl: webhookUrl,
          responseStatus: attempt.responseStatus,
          responseBody: attempt.responseBody,
          error: attempt.error,
          latencyMs: attempt.latencyMs,
        }),
    });
  }

  if (callbackTarget?.callbackUrl) {
    const callbackPayload = JSON.stringify({
      metadata: callbackTarget.callbackMetadata,
      data: queueMessage.event,
    });
    channels.push({
      url: callbackTarget.callbackUrl,
      payload: callbackPayload,
      getLatestStatus: async () =>
        (await getLatestCallbackAttempt(db, queueMessage.event.id))?.status,
      getNextAttemptNumber: async () =>
        getNextCallbackAttemptNumber(db, queueMessage.event.id),
      resolveSecret: async () => {
        if (!callbackTarget.callbackApiKeyId) {
          return { error: "Missing callback apiKeyId for signing" };
        }

        const apiKey = await db.query.apiKeys.findFirst({
          where: eq(apiKeys.id, callbackTarget.callbackApiKeyId),
          columns: {
            keyHash: true,
          },
        });
        if (!apiKey?.keyHash) {
          return { error: "Callback API key not found" };
        }

        const callbackSecret = await deriveSigningSecretFromApiKeyHash(
          env.SIGNING_SECRET,
          apiKey.keyHash,
        );
        return { secret: callbackSecret };
      },
      recordAttempt: async (attempt) =>
        recordCallbackAttempt(db, {
          ...sharedAttemptFields,
          callbackUrl: callbackTarget.callbackUrl,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          responseStatus: attempt.responseStatus,
          responseBody: attempt.responseBody,
          error: attempt.error,
          latencyMs: attempt.latencyMs,
        }),
    });
  }

  let shouldRetryAny = false;
  for (const channel of channels) {
    const retry = await deliverChannel(channel, {
      maxAttempts,
      commonHeaders,
      environmentCallbackHeaders,
    });
    shouldRetryAny = shouldRetryAny || retry;
  }

  if (shouldRetryAny) {
    throw new Error("Retry required for webhook/callback delivery");
  }
});
