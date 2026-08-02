import type { Db } from "@silo-storage/db/client";

import {
  deriveSigningSecretFromApiKeyHash,
  getFileCallbackTargetForEvent,
  getWebhookTargetForEvent,
  normalizeEnvironmentCallbackHeaders,
  queuedWebhookMessageSchema,
  shouldRetryAttempt,
  signWebhookPayload,
} from "@silo-storage/api/service/webhook";
import { and, eq, sql } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import {
  apiKeys,
  callbackAttempts,
  projectEnvironments,
  webhookAttempts,
} from "@silo-storage/db/schema";

type DeliveryAttemptStatus = "success" | "retry" | "failed";

interface AttemptResult {
  status: DeliveryAttemptStatus;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  latencyMs: number;
}

interface ClaimedAttempt {
  id: string;
  attemptNumber: number;
}

interface DeliveryChannel {
  name: "webhook" | "callback";
  url: string;
  payload: string;
  claim: (queueMessageId: string) => Promise<ClaimedAttempt | null>;
  resolveSecret: () => Promise<{ secret: string } | { error: string }>;
  finish: (id: string, result: AttemptResult) => Promise<void>;
}

async function lockDelivery(
  tx: Pick<Db, "execute">,
  key: string,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

async function claimWebhookAttempt(input: {
  eventId: string;
  idempotencyKey: string;
  queueMessageId: string;
  environmentId: string;
  projectId: string;
  requestUrl: string;
}): Promise<ClaimedAttempt | null> {
  return db.transaction(async (tx) => {
    await lockDelivery(tx, `webhook:${input.eventId}`);
    const duplicate = await tx.query.webhookAttempts.findFirst({
      where: and(
        eq(webhookAttempts.eventId, input.eventId),
        eq(webhookAttempts.queueMessageId, input.queueMessageId),
      ),
    });
    if (duplicate) return null;

    const [latest] = await tx.query.webhookAttempts.findMany({
      where: eq(webhookAttempts.eventId, input.eventId),
      orderBy: (attempts, { desc }) => [desc(attempts.attemptNumber)],
      limit: 1,
    });
    if (latest?.status === "success" || latest?.status === "failed") {
      return null;
    }

    const [claimed] = await tx
      .insert(webhookAttempts)
      .values({
        ...input,
        attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        status: "retry",
        latencyMs: 0,
      })
      .returning({
        id: webhookAttempts.id,
        attemptNumber: webhookAttempts.attemptNumber,
      });
    return claimed ?? null;
  });
}

async function claimCallbackAttempt(input: {
  eventId: string;
  idempotencyKey: string;
  queueMessageId: string;
  environmentId: string;
  projectId: string;
  callbackUrl: string;
}): Promise<ClaimedAttempt | null> {
  return db.transaction(async (tx) => {
    await lockDelivery(tx, `callback:${input.eventId}`);
    const duplicate = await tx.query.callbackAttempts.findFirst({
      where: and(
        eq(callbackAttempts.eventId, input.eventId),
        eq(callbackAttempts.queueMessageId, input.queueMessageId),
      ),
    });
    if (duplicate) return null;

    const [latest] = await tx.query.callbackAttempts.findMany({
      where: eq(callbackAttempts.eventId, input.eventId),
      orderBy: (attempts, { desc }) => [desc(attempts.attemptNumber)],
      limit: 1,
    });
    if (latest?.status === "success" || latest?.status === "failed") {
      return null;
    }

    const [claimed] = await tx
      .insert(callbackAttempts)
      .values({
        ...input,
        attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        status: "retry",
        latencyMs: 0,
      })
      .returning({
        id: callbackAttempts.id,
        attemptNumber: callbackAttempts.attemptNumber,
      });
    return claimed ?? null;
  });
}

async function deliverChannel(
  channel: DeliveryChannel,
  input: {
    queueMessageId: string;
    maxAttempts: number;
    commonHeaders: Record<string, string>;
    environmentCallbackHeaders: Record<string, string>;
  },
): Promise<boolean> {
  const claimed = await channel.claim(
    `${input.queueMessageId}:${channel.name}`,
  );
  if (!claimed) return false;

  const startedAt = Date.now();
  try {
    const resolvedSecret = await channel.resolveSecret();
    if ("error" in resolvedSecret) {
      await channel.finish(claimed.id, {
        status: "failed",
        error: resolvedSecret.error,
        latencyMs: Date.now() - startedAt,
      });
      return false;
    }

    const signed = await signWebhookPayload(
      channel.payload,
      resolvedSecret.secret,
    );
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
    const retry =
      !response.ok &&
      shouldRetryAttempt(
        claimed.attemptNumber,
        input.maxAttempts,
        response.status,
      );
    await channel.finish(claimed.id, {
      status: response.ok ? "success" : retry ? "retry" : "failed",
      responseStatus: response.status,
      responseBody,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      latencyMs: Date.now() - startedAt,
    });
    return retry;
  } catch (error) {
    const retry = shouldRetryAttempt(claimed.attemptNumber, input.maxAttempts);
    await channel.finish(claimed.id, {
      status: retry ? "retry" : "failed",
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    });
    return retry;
  }
}

export async function deliverQueuedWebhookMessage(
  rawQueueMessage: unknown,
  input: {
    queueMessageId: string;
    signingSecret: string;
    enabled: boolean;
  },
): Promise<{ retry: boolean }> {
  const queueMessage = queuedWebhookMessageSchema.parse(rawQueueMessage);
  if (!input.enabled) return { retry: false };

  const webhookPayload = JSON.stringify(queueMessage.event);
  const commonHeaders = {
    "Content-Type": "application/json",
    "User-Agent": "silo-webhooks/1.0",
    "X-Silo-Webhook-Id": queueMessage.idempotencyKey,
    "X-Silo-Event-Type": queueMessage.event.type,
    "X-Silo-Event-Version": String(queueMessage.event.version),
  };
  const [webhookTarget, callbackTarget, environmentRow] = await Promise.all([
    getWebhookTargetForEvent(db, {
      environmentId: queueMessage.environmentId,
      eventType: queueMessage.event.type,
    }),
    getFileCallbackTargetForEvent(db, {
      projectId: queueMessage.projectId,
      eventData: queueMessage.event.data,
    }),
    db.query.projectEnvironments.findFirst({
      where: eq(projectEnvironments.id, queueMessage.environmentId),
      columns: { callbackHeaders: true },
    }),
  ]);
  const environmentCallbackHeaders = normalizeEnvironmentCallbackHeaders(
    environmentRow?.callbackHeaders,
  );
  const shared = {
    eventId: queueMessage.event.id,
    idempotencyKey: queueMessage.idempotencyKey,
    environmentId: queueMessage.environmentId,
    projectId: queueMessage.projectId,
  };
  const channels: DeliveryChannel[] = [];

  if (webhookTarget?.webhookUrl && webhookTarget.webhookSecret) {
    const webhookUrl = webhookTarget.webhookUrl;
    const webhookSecret = webhookTarget.webhookSecret;
    channels.push({
      name: "webhook",
      url: webhookUrl,
      payload: webhookPayload,
      claim: (queueMessageId) =>
        claimWebhookAttempt({
          ...shared,
          queueMessageId,
          requestUrl: webhookUrl,
        }),
      resolveSecret: () => Promise.resolve({ secret: webhookSecret }),
      finish: async (id, result) => {
        await db
          .update(webhookAttempts)
          .set(result)
          .where(eq(webhookAttempts.id, id));
      },
    });
  }

  if (callbackTarget?.callbackUrl) {
    const callbackUrl = callbackTarget.callbackUrl;
    channels.push({
      name: "callback",
      url: callbackUrl,
      payload: JSON.stringify({
        metadata: callbackTarget.callbackMetadata,
        data: queueMessage.event,
      }),
      claim: (queueMessageId) =>
        claimCallbackAttempt({
          ...shared,
          queueMessageId,
          callbackUrl,
        }),
      resolveSecret: async () => {
        if (!callbackTarget.callbackApiKeyId) {
          return { error: "Missing callback apiKeyId for signing" };
        }
        const apiKey = await db.query.apiKeys.findFirst({
          where: eq(apiKeys.id, callbackTarget.callbackApiKeyId),
          columns: { keyHash: true },
        });
        if (!apiKey?.keyHash) return { error: "Callback API key not found" };
        return {
          secret: await deriveSigningSecretFromApiKeyHash(
            input.signingSecret,
            apiKey.keyHash,
          ),
        };
      },
      finish: async (id, result) => {
        await db
          .update(callbackAttempts)
          .set(result)
          .where(eq(callbackAttempts.id, id));
      },
    });
  }

  let retry = false;
  for (const channel of channels) {
    retry =
      (await deliverChannel(channel, {
        queueMessageId: input.queueMessageId,
        maxAttempts: queueMessage.maxAttempts ?? 8,
        commonHeaders,
        environmentCallbackHeaders,
      })) || retry;
  }
  return { retry };
}
