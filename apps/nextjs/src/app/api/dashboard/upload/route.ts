import { headers } from "next/headers";
import { nanoid } from "nanoid";
import { z } from "zod";

import { and, eq, gt, isNull, or } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import {
  apiKeys,
  members,
  projectEnvironments,
  projects,
} from "@silo-storage/db/schema";
import { generateSignedUploadUrlFromHash } from "@silo-storage/shared/signing";

import { auth } from "@/auth/server";
import { env } from "@/env";
import { registerFileKeyIntent } from "@/lib/upload/register";

const schema = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  fileName: z.string().min(1),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  mimeType: z.string().optional(),
  isPublic: z.boolean().optional(),
  serveImage: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  if (!env.UPLOADS_ENABLED) {
    return new Response(
      JSON.stringify({
        error: "Service Unavailable",
        message: "Uploads are temporarily paused for maintenance.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Not authenticated." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Bad Request", message: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Invalid request body",
        details: result.error.issues,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    projectId,
    environmentId,
    fileName,
    size,
    mimeType,
    isPublic,
    serveImage,
    metadata,
  } = result.data;

  // Verify the project belongs to one of the user's organizations
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project?.parentOrganizationId) {
    return new Response(
      JSON.stringify({ error: "Not Found", message: "Project not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify the session user is a member of this project's organization
  const membership = await db.query.members.findFirst({
    where: and(
      eq(members.organizationId, project.parentOrganizationId),
      eq(members.userId, session.user.id),
    ),
  });

  if (!membership) {
    return new Response(
      JSON.stringify({
        error: "Forbidden",
        message: "You do not have access to this project.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const environment = await db.query.projectEnvironments.findFirst({
    where: and(
      eq(projectEnvironments.id, environmentId),
      eq(projectEnvironments.projectId, projectId),
    ),
  });
  if (!environment) {
    return new Response(
      JSON.stringify({
        error: "Not Found",
        message: "Environment not found.",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Find an active, non-expired API key for this project
  const apiKey = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.projectId, projectId),
      or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
      eq(apiKeys.environmentId, environmentId),
    ),
  });

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message:
          "No active API key found for this project. Create one in Project Settings > API Keys.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const fileKeyId = nanoid(16);
    const accessKey = nanoid(32);

    const resolvedIsPublic = isPublic ?? project.defaultFileAccess === "public";

    const newFileKey = await registerFileKeyIntent({
      projectId,
      environmentId,
      fileKey: {
        fileKeyId,
        accessKey,
        fileName,
        size,
        mimeType,
        isPublic: resolvedIsPublic,
        serveImage,
        metadata,
      },
      apiKeyId: apiKey.id,
    });

    const isDevelopment = env.NODE_ENV === "development";
    const protocol = isDevelopment ? "http" : "https";

    const uploadUrl = await generateSignedUploadUrlFromHash(
      env.WORKER_DOMAIN,
      project.slug,
      {
        environmentId,
        fileKeyId,
        accessKey,
        fileName,
        size,
        mimeType,
        isPublic: resolvedIsPublic,
        keyId: apiKey.id,
        expiresIn: 3600,
        protocol,
      },
      apiKey.keyHash,
      env.SIGNING_SECRET,
      {
        routeMode: env.PROJECT_ROUTE_MODE,
      },
    );

    return new Response(
      JSON.stringify({
        uploadUrl,
        fileKeyId,
        accessKey: newFileKey.accessKey,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error creating dashboard upload URL:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Failed to create upload URL",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
