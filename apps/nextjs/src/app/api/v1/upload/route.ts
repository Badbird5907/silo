import { nanoid } from "nanoid";
import { z } from "zod";

import { generateSignedUploadUrl } from "@silo-storage/shared/signing";

import { env } from "@/env";
import {
  authenticateRequest,
  ensureEnvironmentWritable,
  ensureProjectWritable,
  jsonError,
  validateEnvironmentAccess,
  validateProjectAccess,
} from "@/lib/api-key-middleware";
import { createDevUploadEventStream } from "@/lib/upload/dev-sse";
import { registerFileKeyIntent } from "@/lib/upload/register";

const schema = z.object({
  environmentId: z.string(),
  accessKey: z.string().min(1),
  fileName: z.string().min(1),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  mimeType: z.string().optional(),
  hash: z.string().optional(),
  isPublic: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  callbackUrl: z.string().url().optional(),
  callbackMetadata: z.record(z.string(), z.unknown()).optional(),
  dev: z.boolean().optional(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  if (authResult.type !== "apiKey" || !authResult.rawApiKey) {
    return jsonError(
      "Unauthorized",
      "API key is required for upload. Use Authorization: Bearer <key> or X-API-Key header.",
      401,
    );
  }

  const apiKey = authResult.rawApiKey;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Bad Request", "Invalid JSON body.", 400);
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return jsonError(
      "Bad Request",
      "Invalid request body.",
      400,
      result.error.issues,
    );
  }

  const {
    environmentId,
    accessKey,
    fileName,
    size,
    mimeType,
    hash,
    isPublic,
    metadata,
    callbackUrl,
    callbackMetadata,
    dev: isDev,
  } = result.data;

  const projectId = authResult.projectId;
  if (!projectId) {
    return jsonError(
      "Unauthorized",
      "API key is not scoped to a project.",
      401,
    );
  }

  const project = await validateProjectAccess(authResult, projectId);
  if (project instanceof Response) return project;
  const projectWritable = ensureProjectWritable(project);
  if (projectWritable) return projectWritable;

  const environment = await validateEnvironmentAccess(environmentId, projectId);
  if (environment instanceof Response) return environment;
  const environmentWritable = ensureEnvironmentWritable(environment);
  if (environmentWritable) return environmentWritable;

  try {
    const fileKeyId = nanoid(16);
    const resolvedIsPublic = isPublic ?? project.defaultFileAccess === "public";

    const keyId = apiKey.substring(0, 11);
    const protocol = env.NODE_ENV === "development" ? "http" : "https";

    const uploadUrl = await generateSignedUploadUrl(
      env.WORKER_DOMAIN,
      project.slug,
      {
        environmentId,
        fileKeyId,
        accessKey,
        fileName,
        size,
        hash,
        mimeType,
        isPublic: resolvedIsPublic,
        keyId,
        expiresIn: 3600,
        protocol,
      },
      apiKey,
      env.SIGNING_SECRET,
      {
        routeMode: env.PROJECT_ROUTE_MODE,
      },
    );

    await registerFileKeyIntent({
      projectId,
      environmentId,
      fileKey: {
        fileKeyId,
        accessKey,
        fileName,
        size,
        mimeType,
        hash,
        isPublic: resolvedIsPublic,
        metadata,
      },
      callbackUrl,
      callbackMetadata,
      apiKeyId: authResult.apiKeyId,
    });

    if (isDev) {
      if (!env.DEV_UPLOAD_SSE_ENABLED) {
        return jsonError(
          "Service Unavailable",
          "SSE upload events are disabled.",
          503,
        );
      }
      if (environment.type !== "development") {
        return jsonError(
          "Not Found",
          "SSE upload events are only available for development environments.",
          404,
        );
      }

      return createDevUploadEventStream(request, {
        projectId,
        environmentId,
        fileKeyId,
      });
    }

    return new Response(
      JSON.stringify({
        uploadUrl,
        fileKeyId,
        accessKey,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error creating upload URL:", error);
    return jsonError(
      "Internal Server Error",
      "Failed to create upload URL.",
      500,
    );
  }
}
