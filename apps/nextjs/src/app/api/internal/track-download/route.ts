import type { AuditLogDownloadPolicy } from "@silo-storage/api/service/retention";
import { z } from "zod";

import {
  buildSystemAuditActor,
  recordUsageAuditEvent,
} from "@silo-storage/api/service/audit";
import { computeRetentionExpiry } from "@silo-storage/api/service/retention";
import { eq, sql } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { projects, usageDaily, usageEvents } from "@silo-storage/db/schema";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";

const schema = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  fileId: z.string(),
  fileKeyId: z.string(),
  fileName: z.string(),
  bytes: z.number(),
  isSignedUrl: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!isCallbackAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request",
        details: parsed.error.issues,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { projectId, environmentId, fileId, fileKeyId, fileName, bytes } =
    parsed.data;

  try {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: {
        parentOrganizationId: true,
        auditLogDownloadPolicy: true,
        auditLogRetentionDays: true,
        usageEventRetentionDays: true,
      },
    });

    if (!project?.parentOrganizationId) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const organizationId = project.parentOrganizationId;
    const createdAt = new Date();
    const expiresAt = computeRetentionExpiry(
      createdAt,
      project.usageEventRetentionDays,
    );

    await db.insert(usageEvents).values({
      organizationId,
      projectId,
      environmentId,
      eventType: "download",
      bytes,
      fileId,
      createdAt,
      expiresAt,
    });

    await recordUsageAuditEvent(db, {
      organizationId,
      projectId,
      environmentId,
      eventType: "download",
      bytes,
      fileId,
      actor: buildSystemAuditActor("System"),
      resourceLabel: fileName,
      resourceId: fileKeyId,
      createdAt,
      isSignedUrl: parsed.data.isSignedUrl ?? false,
      auditLogDownloadPolicy:
        project.auditLogDownloadPolicy as AuditLogDownloadPolicy,
      auditRetentionDays: project.auditLogRetentionDays,
      metadata: {
        fileKeyId,
      },
    });

    const today = new Date().toISOString().split("T")[0];

    await db
      .insert(usageDaily)
      .values({
        organizationId,
        projectId,
        environmentId,
        date: today,
        downloads: 1,
        bytesDownloaded: bytes,
      } as typeof usageDaily.$inferInsert)
      .onConflictDoUpdate({
        target: [
          usageDaily.organizationId,
          usageDaily.projectId,
          usageDaily.environmentId,
          usageDaily.date,
        ],
        set: {
          downloads: sql`${usageDaily.downloads} + 1`,
          bytesDownloaded: sql`${usageDaily.bytesDownloaded} + ${bytes}`,
          updatedAt: new Date(),
        },
      });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error tracking download:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
