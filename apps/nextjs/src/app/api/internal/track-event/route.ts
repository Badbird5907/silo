import { z } from "zod";

import {
  buildApiKeyAuditActor,
  buildSystemAuditActor,
  recordUsageAuditEvent,
} from "@silo-storage/api/service/audit";
import { eq, sql } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { projects, usageDaily, usageEvents } from "@silo-storage/db/schema";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";

const eventSchema = z.object({
  eventType: z.enum([
    "upload_started",
    "upload_completed",
    "upload_failed",
    "download",
  ]),
  projectId: z.string(),
  environmentId: z.string(),
  bytes: z.number().optional(),
  fileId: z.string().optional(),
  apiKeyId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  if (!isCallbackAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = eventSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request",
        details: parsed.error.issues,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    eventType,
    projectId,
    environmentId,
    bytes,
    fileId,
    apiKeyId,
    metadata,
  } = parsed.data;

  try {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { parentOrganizationId: true },
    });

    if (!project?.parentOrganizationId) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const organizationId = project.parentOrganizationId;

    await db.insert(usageEvents).values({
      organizationId,
      projectId,
      environmentId,
      eventType,
      bytes: bytes ?? null,
      fileId: fileId ?? null,
      apiKeyId: apiKeyId ?? null,
      metadata: metadata ?? null,
    });

    await recordUsageAuditEvent(db, {
      organizationId,
      projectId,
      environmentId,
      eventType,
      bytes,
      fileId,
      actor: apiKeyId
        ? buildApiKeyAuditActor({})
        : buildSystemAuditActor("Internal"),
      resourceLabel:
        typeof metadata?.fileName === "string" ? metadata.fileName : null,
      metadata: {
        apiKeyId: apiKeyId ?? null,
        fileKeyId:
          typeof metadata?.fileKeyId === "string" ? metadata.fileKeyId : null,
        fileName:
          typeof metadata?.fileName === "string" ? metadata.fileName : null,
      },
    });

    const today = new Date().toISOString().split("T")[0];

    const updateField = {
      upload_started: "uploadsStarted",
      upload_completed: "uploadsCompleted",
      upload_failed: "uploadsFailed",
      download: "downloads",
    }[eventType] as keyof typeof usageDaily.$inferSelect;

    const bytesField =
      eventType === "upload_completed"
        ? "bytesUploaded"
        : eventType === "download"
          ? "bytesDownloaded"
          : null;

    await db
      .insert(usageDaily)
      .values({
        organizationId,
        projectId,
        environmentId,
        date: today,
        [updateField]: 1,
        ...(bytesField && bytes ? { [bytesField]: bytes } : {}),
      } as typeof usageDaily.$inferInsert)
      .onConflictDoUpdate({
        target: [
          usageDaily.organizationId,
          usageDaily.projectId,
          usageDaily.environmentId,
          usageDaily.date,
        ],
        set: {
          [updateField]: sql`${usageDaily[updateField]} + 1`,
          ...(bytesField && bytes
            ? {
                [bytesField]: sql`${usageDaily[bytesField as keyof typeof usageDaily.$inferSelect]} + ${bytes}`,
              }
            : {}),
          updatedAt: new Date(),
        },
      });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error tracking event:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
