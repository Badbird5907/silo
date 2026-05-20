import type { Db } from "@silo-storage/db/client";
import type { UploadEventEnvelope } from "@silo-storage/shared";
import { send } from "@vercel/queue";
import { z } from "zod";

import { and, eq } from "@silo-storage/db";
import {
  callbackAttempts,
  fileKeys,
  projectEnvironments,
  webhookAttempts,
} from "@silo-storage/db/schema";

const WEBHOOK_TOPIC = "upload-webhooks";
const DEFAULT_MAX_ATTEMPTS = 8;

interface WebhookEnvironmentConfig {
  id: string;
  type: "development" | "staging" | "production";
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookSecret: string | null;
  webhookEvents: string[];
}

function parseEnvironmentType(
  value: unknown,
): WebhookEnvironmentConfig["type"] | null {
  if (
    value === "development" ||
    value === "staging" ||
    value === "production"
  ) {
    return value;
  }
  return null;
}
export const queuedWebhookMessageSchema = z.object({
  idempotencyKey: z.string(),
  environmentId: z.string(),
  projectId: z.string(),
  maxAttempts: z.number().int().positive().optional(),
  event: z.object({
    id: z.string(),
    type: z.string(),
    version: z.literal(1),
    occurredAt: z.string(),
    data: z.unknown(),
  }),
});

function getStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

function getObjectField(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getFileKeyIdFromEventData(data: unknown): string | null {
  return getStringField(data, "fileKeyId");
}

/** Safe string headers only; used when delivering webhooks/callbacks to customer URLs. */
export function normalizeEnvironmentCallbackHeaders(
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === "string" && k.length > 0 && typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

export async function getFileCallbackTargetForEvent(
  db: Db,
  input: {
    projectId: string;
    eventData: unknown;
  },
) {
  const fileKeyId = getFileKeyIdFromEventData(input.eventData);
  if (!fileKeyId) {
    return null;
  }

  const fileKey = await db.query.fileKeys.findFirst({
    where: and(
      eq(fileKeys.id, fileKeyId),
      eq(fileKeys.projectId, input.projectId),
    ),
    columns: {
      callbackMetadata: true,
    },
  });

  const callbackUrl = getStringField(fileKey?.callbackMetadata, "callbackUrl");
  if (!callbackUrl) {
    return null;
  }

  return {
    callbackUrl,
    callbackApiKeyId: getStringField(fileKey?.callbackMetadata, "apiKeyId"),
    callbackMetadata: getObjectField(fileKey?.callbackMetadata),
  };
}

function environmentAllowsEvent(
  environment: WebhookEnvironmentConfig,
  eventType: string,
) {
  // if (environment.type !== "production") return false;
  if (!environment.webhookEnabled) {
    console.log("webhook not enabled", environment.id);
    return false;
  }
  if (!environment.webhookUrl || !environment.webhookSecret) {
    console.log("webhook url or secret not set", environment.id);
    return false;
  }
  if (environment.webhookEvents.length === 0) {
    console.log("webhook events not set", environment.id);
    return true;
  }
  const allowed = environment.webhookEvents.includes(eventType);
  console.log("event allowed", eventType, allowed);
  return allowed;
}

export async function enqueueUploadWebhookEvent(
  db: Db,
  input: {
    environmentId: string;
    projectId: string;
    event: UploadEventEnvelope;
    idempotencyKey?: string;
    maxAttempts?: number;
  },
) {
  console.log("enqueueUploadWebhookEvent", input);
  const env = await db.query.projectEnvironments.findFirst({
    where: eq(projectEnvironments.id, input.environmentId),
    columns: {
      id: true,
      type: true,
      webhookEnabled: true,
      webhookUrl: true,
      webhookSecret: true,
      webhookEvents: true,
    },
  });

  if (!env) {
    console.log("environment not found", input.environmentId);
    return {
      enqueued: false as const,
      reason: "environment_not_found" as const,
    };
  }

  const parsedType = parseEnvironmentType(env.type);
  if (!parsedType) {
    console.log("invalid environment type", env.type);
    return { enqueued: false as const, reason: "not_configured" as const };
  }

  const normalizedEnvironment: WebhookEnvironmentConfig = {
    ...env,
    type: parsedType,
    webhookEvents: Array.isArray(env.webhookEvents) ? env.webhookEvents : [],
  };

  const webhookAllowed = environmentAllowsEvent(
    normalizedEnvironment,
    input.event.type,
  );
  const callbackTarget = await getFileCallbackTargetForEvent(db, {
    projectId: input.projectId,
    eventData: input.event.data,
  });
  const callbackAllowed = !!callbackTarget;

  if (!webhookAllowed && !callbackAllowed) {
    console.log("event not allowed", input.event.type);
    return { enqueued: false as const, reason: "not_configured" as const };
  }

  // Preserve local dev flow (SSE/polling) without requiring queue infra.
  // if (process.env.NODE_ENV !== "production") {
  //   return { enqueued: false as const, reason: "local_noop" as const };
  // }

  if (process.env.WEBHOOK_DELIVERY_ENABLED === "false") {
    console.log("delivery disabled");
    return { enqueued: false as const, reason: "delivery_disabled" as const };
  }

  console.log("enqueueing webhook event", input);

  await send(WEBHOOK_TOPIC, {
    idempotencyKey: input.idempotencyKey ?? input.event.id,
    environmentId: input.environmentId,
    projectId: input.projectId,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    event: input.event,
  } satisfies z.infer<typeof queuedWebhookMessageSchema>);

  return { enqueued: true as const };
}

export async function getWebhookTargetForEvent(
  db: Db,
  input: {
    environmentId: string;
    eventType: string;
  },
) {
  const environment = await db.query.projectEnvironments.findFirst({
    where: eq(projectEnvironments.id, input.environmentId),
    columns: {
      type: true,
      webhookEnabled: true,
      webhookUrl: true,
      webhookSecret: true,
      webhookEvents: true,
    },
  });

  if (!environment) return null;

  const parsedType = parseEnvironmentType(environment.type);
  if (!parsedType) return null;

  const normalizedEnvironment: WebhookEnvironmentConfig = {
    ...environment,
    id: input.environmentId,
    type: parsedType,
    webhookEvents: Array.isArray(environment.webhookEvents)
      ? environment.webhookEvents
      : [],
  };

  if (!environmentAllowsEvent(normalizedEnvironment, input.eventType)) {
    return null;
  }

  return {
    webhookUrl: normalizedEnvironment.webhookUrl,
    webhookSecret: normalizedEnvironment.webhookSecret,
  };
}

export async function webhookAttempt(
  db: Db,
  input: typeof webhookAttempts.$inferInsert,
) {
  console.log("recording webhook attempt", input);
  await db.insert(webhookAttempts).values(input);
}

export async function recordCallbackAttempt(
  db: Db,
  input: typeof callbackAttempts.$inferInsert,
) {
  console.log("recording callback attempt", input);
  await db.insert(callbackAttempts).values(input);
}

export async function getLatestWebhookAttempt(db: Db, eventId: string) {
  const [lastAttempt] = await db.query.webhookAttempts.findMany({
    where: eq(webhookAttempts.eventId, eventId),
    orderBy: (attempts, { desc: byDesc }) => [byDesc(attempts.attemptNumber)],
    limit: 1,
  });
  return lastAttempt ?? null;
}

export async function getNextAttemptNumber(db: Db, eventId: string) {
  const lastAttempt = await getLatestWebhookAttempt(db, eventId);
  return (lastAttempt?.attemptNumber ?? 0) + 1;
}

export async function getLatestCallbackAttempt(db: Db, eventId: string) {
  const [lastAttempt] = await db.query.callbackAttempts.findMany({
    where: eq(callbackAttempts.eventId, eventId),
    orderBy: (attempts, { desc: byDesc }) => [byDesc(attempts.attemptNumber)],
    limit: 1,
  });
  return lastAttempt ?? null;
}

export async function getNextCallbackAttemptNumber(db: Db, eventId: string) {
  const lastAttempt = await getLatestCallbackAttempt(db, eventId);
  return (lastAttempt?.attemptNumber ?? 0) + 1;
}

export function isRetriableWebhookStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export function shouldRetryAttempt(
  attemptNumber: number,
  maxAttempts: number,
  status?: number,
): boolean {
  if (attemptNumber >= maxAttempts) return false;
  if (status === undefined) return true;
  return isRetriableWebhookStatus(status);
}

export async function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  const digest = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    timestamp,
    signature: `t=${timestamp},v1=${digest}`,
  };
}

export async function deriveSigningSecretFromApiKeyHash(
  signingSecret: string,
  keyHash: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derivedSecretBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(keyHash),
  );
  return Array.from(new Uint8Array(derivedSecretBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
