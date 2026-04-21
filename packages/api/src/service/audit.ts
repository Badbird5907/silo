import type { Db } from "@silo-storage/db/client";
import type {
  AuditActorType,
  AuditChange,
  AuditEventCategory,
  AuditResourceType,
  AuditStatus,

  AuditEventCode} from "@silo-storage/shared";

import { auditEvents } from "@silo-storage/db/schema";
import {
  usageEventTypeToAuditEventCode,
} from "@silo-storage/shared";

import type { AuthContext } from "../types/auth";
import {
  computeRetentionExpiry,
  getProjectRetentionSettings,
  shouldRecordDownloadAudit,
} from "./retention";

const SENSITIVE_FIELD_PATTERN =
  /(secret|token|authorization|api[-_]?key|password|signature|cookie)/i;

export interface AuditActor {
  actorType: AuditActorType;
  actorUserId?: string | null;
  actorMemberId?: string | null;
  actorLabel?: string | null;
}

export interface RecordAuditEventInput extends AuditActor {
  organizationId: string;
  projectId?: string | null;
  environmentId?: string | null;
  eventCode: AuditEventCode;
  eventCategory: AuditEventCategory;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  resourceLabel?: string | null;
  status?: AuditStatus;
  summary: string;
  changes?: AuditChange[] | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  expiresAt?: Date | null;
  retentionDays?: number;
}

type AuditInsertDb = Pick<Db, "insert" | "query">;

export async function recordAuditEvent(
  db: AuditInsertDb,
  input: RecordAuditEventInput,
) {
  const createdAt = input.createdAt ?? new Date();
  let expiresAt = input.expiresAt;

  if (expiresAt === undefined && input.projectId) {
    const retentionDays =
      input.retentionDays ??
      (await getProjectRetentionSettings(db, input.projectId))
        ?.auditLogRetentionDays;

    if (retentionDays !== undefined) {
      expiresAt = computeRetentionExpiry(createdAt, retentionDays);
    }
  }

  await db.insert(auditEvents).values({
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    environmentId: input.environmentId ?? null,
    actorType: input.actorType,
    actorUserId: input.actorUserId ?? null,
    actorMemberId: input.actorMemberId ?? null,
    actorLabel: input.actorLabel ?? null,
    eventCode: input.eventCode,
    eventCategory: input.eventCategory,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    resourceLabel: input.resourceLabel ?? null,
    status: input.status ?? "success",
    summary: input.summary,
    changes: input.changes ?? null,
    metadata: sanitizeMetadata(input.metadata ?? {}),
    createdAt,
    expiresAt: expiresAt ?? null,
  });
}

export async function recordUsageAuditEvent(
  db: AuditInsertDb,
  input: {
    organizationId: string;
    projectId: string;
    environmentId: string;
    eventType:
      | "upload_started"
      | "upload_completed"
      | "upload_failed"
      | "download"
      | "file_deleted";
    bytes?: number | null;
    fileId?: string | null;
    actor?: AuditActor;
    resourceId?: string | null;
    resourceLabel?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt?: Date;
    isSignedUrl?: boolean;
    auditLogDownloadPolicy?: "disabled" | "always" | "signed_only";
    auditRetentionDays?: number;
  },
) {
  if (input.eventType === "download") {
    const policy =
      input.auditLogDownloadPolicy ??
      (await getProjectRetentionSettings(db, input.projectId))
        ?.auditLogDownloadPolicy ??
      "disabled";

    if (
      !shouldRecordDownloadAudit({
        policy,
        isSignedUrl: input.isSignedUrl ?? false,
      })
    ) {
      return;
    }
  }

  const eventCode = usageEventTypeToAuditEventCode(input.eventType);
  const summary = getUsageAuditSummary(input.eventType, input.resourceLabel);

  await recordAuditEvent(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...(input.actor ?? buildSystemAuditActor()),
    eventCode,
    eventCategory: "operational",
    resourceType: "file",
    resourceId: input.resourceId ?? input.fileId ?? null,
    resourceLabel: input.resourceLabel ?? null,
    status: input.eventType === "upload_failed" ? "failure" : "success",
    summary,
    metadata: {
      bytes: input.bytes ?? null,
      fileId: input.fileId ?? null,
      ...(input.eventType === "download"
        ? { isSignedUrl: input.isSignedUrl ?? false }
        : {}),
      ...(input.metadata ?? {}),
    },
    createdAt: input.createdAt,
    retentionDays: input.auditRetentionDays,
  });
}

export function buildUserAuditActor(input: {
  userId: string;
  memberId?: string | null;
  name?: string | null;
  email?: string | null;
}): AuditActor {
  return {
    actorType: "user",
    actorUserId: input.userId,
    actorMemberId: input.memberId ?? null,
    actorLabel: input.name ?? input.email ?? input.userId,
  };
}

export function buildApiKeyAuditActor(input: {
  keyPrefix?: string | null;
  keyName?: string | null;
}): AuditActor {
  const parts = [input.keyName, input.keyPrefix].filter(Boolean);
  return {
    actorType: "api_key",
    actorLabel: parts.length > 0 ? parts.join(" ") : "API key",
  };
}

export const buildAuditActorFromAuthResult = (
  authContext: AuthContext,
): AuditActor => {
  if (authContext.type === "apiKey") {
    return buildApiKeyAuditActor({
      keyPrefix: authContext.apiKey.prefix,
      keyName: authContext.apiKey.name,
    });
  }
  return buildUserAuditActor({
    userId: authContext.userId,
    memberId: authContext.memberId,
    name: authContext.name,
    email: authContext.email,
  });
};

export function buildSystemAuditActor(label = "System"): AuditActor {
  return {
    actorType: "system",
    actorLabel: label,
  };
}

export function buildAuditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options?: {
    transforms?: Partial<Record<string, (value: unknown) => unknown>>;
    pathPrefix?: string;
  },
): AuditChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditChange[] = [];

  for (const key of keys) {
    const transform = options?.transforms?.[key];
    const beforeValue = transform ? transform(before[key]) : before[key];
    const afterValue = transform ? transform(after[key]) : after[key];

    if (serializeComparable(beforeValue) === serializeComparable(afterValue)) {
      continue;
    }

    changes.push({
      path: options?.pathPrefix ? `${options.pathPrefix}.${key}` : key,
      before: sanitizeValue(
        options?.pathPrefix ? `${options.pathPrefix}.${key}` : key,
        beforeValue,
      ),
      after: sanitizeValue(
        options?.pathPrefix ? `${options.pathPrefix}.${key}` : key,
        afterValue,
      ),
    });
  }

  return changes;
}

export function buildHeaderAuditChanges(
  before: Record<string, string>,
  after: Record<string, string>,
  pathPrefix = "callbackHeaders",
): AuditChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditChange[] = [];

  for (const headerName of keys) {
    const path = `${pathPrefix}.${headerName}`;
    const beforeValue = redactHeaderValue(headerName, before[headerName]);
    const afterValue = redactHeaderValue(headerName, after[headerName]);

    if (serializeComparable(beforeValue) === serializeComparable(afterValue)) {
      continue;
    }

    changes.push({
      path,
      before: beforeValue,
      after: afterValue,
    });
  }

  return changes;
}

export function normalizeUrlValue(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export function redactHeaderValue(
  headerName: string,
  value: string | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  if (SENSITIVE_FIELD_PATTERN.test(headerName)) {
    return "[REDACTED]";
  }
  return value;
}

export function redactSensitiveValue(path: string, value: unknown): unknown {
  return sanitizeValue(path, value);
}

function sanitizeMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sanitizeValue(key, value),
    ]),
  );
}

function sanitizeValue(path: string, value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (SENSITIVE_FIELD_PATTERN.test(path)) {
    return "[REDACTED]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(path, item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeValue(`${path}.${key}`, nestedValue),
      ]),
    );
  }

  return value;
}

function serializeComparable(value: unknown): string {
  return JSON.stringify(value);
}

function getUsageAuditSummary(
  eventType:
    | "upload_started"
    | "upload_completed"
    | "upload_failed"
    | "download"
    | "file_deleted",
  resourceLabel?: string | null,
): string {
  const suffix = resourceLabel ? ` for ${resourceLabel}` : "";
  switch (eventType) {
    case "upload_started":
      return `Upload started${suffix}`;
    case "upload_completed":
      return `Upload completed${suffix}`;
    case "upload_failed":
      return `Upload failed${suffix}`;
    case "download":
      return `File downloaded${suffix}`;
    case "file_deleted":
      return `${resourceLabel} deleted`;
  }
}
