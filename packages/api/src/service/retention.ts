import type { Db } from "@silo-storage/db/client";
import { and, count, eq, isNotNull, lte } from "drizzle-orm";

import { auditEvents, projects, usageEvents } from "@silo-storage/db/schema";

export type AuditLogDownloadPolicy = "disabled" | "always" | "signed_only";

export interface ProjectRetentionSettings {
  auditLogDownloadPolicy: AuditLogDownloadPolicy;
  auditLogRetentionDays: number;
  usageEventRetentionDays: number;
}

export function computeRetentionExpiry(
  createdAt: Date,
  retentionDays: number,
): Date {
  const safeRetentionDays = Number.isFinite(retentionDays)
    ? Math.max(0, retentionDays)
    : 0;

  return new Date(
    createdAt.getTime() + safeRetentionDays * 24 * 60 * 60 * 1000,
  );
}

export async function getProjectRetentionSettings(
  db: Pick<Db, "query">,
  projectId: string,
): Promise<ProjectRetentionSettings | undefined> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      auditLogDownloadPolicy: true,
      auditLogRetentionDays: true,
      usageEventRetentionDays: true,
    },
  });

  if (!project) {
    return undefined;
  }

  return {
    ...project,
    auditLogDownloadPolicy:
      project.auditLogDownloadPolicy as AuditLogDownloadPolicy,
  };
}

export function shouldRecordDownloadAudit(input: {
  policy: AuditLogDownloadPolicy;
  isSignedUrl: boolean;
}): boolean {
  switch (input.policy) {
    case "always":
      return true;
    case "signed_only":
      return input.isSignedUrl;
    case "disabled":
    default:
      return false;
  }
}

export async function purgeExpiredRetentionRecords(
  db: Pick<Db, "select" | "delete">,
) {
  const now = new Date();

  const [auditCountRow] = await db
    .select({ count: count() })
    .from(auditEvents)
    .where(
      and(isNotNull(auditEvents.expiresAt), lte(auditEvents.expiresAt, now)),
    );

  const [usageCountRow] = await db
    .select({ count: count() })
    .from(usageEvents)
    .where(
      and(isNotNull(usageEvents.expiresAt), lte(usageEvents.expiresAt, now)),
    );

  const deletedAuditEvents = Number(auditCountRow?.count ?? 0);
  const deletedUsageEvents = Number(usageCountRow?.count ?? 0);

  if (deletedAuditEvents > 0) {
    await db
      .delete(auditEvents)
      .where(
        and(isNotNull(auditEvents.expiresAt), lte(auditEvents.expiresAt, now)),
      );
  }

  if (deletedUsageEvents > 0) {
    await db
      .delete(usageEvents)
      .where(
        and(isNotNull(usageEvents.expiresAt), lte(usageEvents.expiresAt, now)),
      );
  }

  return {
    deletedAuditEvents,
    deletedUsageEvents,
    executedAt: now.toISOString(),
  };
}
