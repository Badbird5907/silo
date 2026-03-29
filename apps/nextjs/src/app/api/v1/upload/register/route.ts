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
import {
  registerFileKeyIntent,
  registerUploadBodySchema,
} from "@/lib/upload/register";

export async function POST(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;
  if (authResult.type !== "apiKey" || !authResult.rawApiKey) {
    return jsonError(
      "Unauthorized",
      "API key is required for upload registration. Use Authorization: Bearer <key> or X-API-Key header.",
      401,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Bad Request", "Invalid JSON body.", 400);
  }

  const parsed = registerUploadBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "Bad Request",
      "Invalid request body.",
      400,
      parsed.error.issues,
    );
  }

  const {
    environmentId,
    fileKeys,
    callbackUrl,
    callbackMetadata,
    dev,
    fileExpiry,
  } = parsed.data;

  const resolvedExpiresAt =
    fileExpiry && "ttlSeconds" in fileExpiry
      ? new Date(Date.now() + fileExpiry.ttlSeconds * 1000)
      : fileExpiry && "expiresAt" in fileExpiry
        ? fileExpiry.expiresAt
          ? new Date(fileExpiry.expiresAt)
          : null
        : undefined;

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
    const registered = [];
    for (const fileKey of fileKeys) {
      const row = await registerFileKeyIntent({
        projectId,
        environmentId,
        fileKey,
        expiresAt: resolvedExpiresAt,
        callbackUrl,
        callbackMetadata,
        apiKeyId: authResult.apiKeyId,
      });
      registered.push({
        fileKeyId: row.id,
        accessKey: row.accessKey,
        status: row.status,
      });
    }

    if (dev) {
      if (!env.DEV_UPLOAD_SSE_ENABLED) {
        return jsonError(
          "Service Unavailable",
          "SSE upload events are disabled.",
          503,
        );
      }
      if (environment.type !== "development") {
        return jsonError(
          "Bad Request",
          "SSE upload events are only available for development environments.",
          400,
        );
      }

      const firstRegistered = registered[0];
      if (!firstRegistered) {
        return jsonError(
          "Internal Server Error",
          "No file key registrations were persisted.",
          500,
        );
      }

      const streamResponse = await createDevUploadEventStream(request, {
        projectId,
        environmentId,
        fileKeyId: firstRegistered.fileKeyId,
      });
      const headers = new Headers(streamResponse.headers);
      headers.set("x-silo-project-slug", project.slug);
      return new Response(streamResponse.body, {
        status: streamResponse.status,
        headers,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        projectSlug: project.slug,
        fileKeys: registered,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error registering upload:", error);
    return jsonError(
      "Internal Server Error",
      "Failed to register upload.",
      500,
    );
  }
}
