import type { AuthContext } from "@silo-storage/api/types/auth";
import { headers } from "next/headers";

import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import {
  apiKeys,
  members,
  projectEnvironments,
  projects,
} from "@silo-storage/db/schema";

import { auth } from "@/auth/server";

type Project = typeof projects.$inferSelect;
type ProjectEnvironment = typeof projectEnvironments.$inferSelect;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(
  error: string,
  message: string,
  status: number,
  details?: unknown,
): Response {
  return new Response(
    JSON.stringify({ error, message, ...(details ? { details } : {}) }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractApiKeyFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const apiKeyHeader = request.headers.get("X-API-Key");
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  return null;
}

export async function authenticateRequest(
  request: Request,
): Promise<AuthContext | Response> {
  const apiKey = extractApiKeyFromRequest(request);

  if (apiKey) {
    try {
      const keyHash = await hashApiKey(apiKey);

      const key = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.keyHash, keyHash),
      });

      if (!key) {
        return jsonError("Unauthorized", "Invalid or expired API key.", 401);
      }

      if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
        return jsonError("Unauthorized", "Invalid or expired API key.", 401);
      }

      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id));

      return {
        type: "apiKey",
        organizationId: key.organizationId,
        projectId: key.projectId,
        apiKey: {
          rawKey: apiKey,
          prefix: key.keyPrefix,
          name: key.name,
          id: key.id,
        },
      };
    } catch (error) {
      console.error("Error validating API key:", error);
      return jsonError("Unauthorized", "Invalid or expired API key.", 401);
    }
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return jsonError(
      "Unauthorized",
      "Authentication required. Use an API key (Authorization: Bearer <key> or X-API-Key header) or a valid session.",
      401,
    );
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  if (!organizationId) {
    return jsonError(
      "Bad Request",
      "organizationId query parameter is required for session-based authentication.",
      400,
    );
  }

  const membership = await db.query.members.findFirst({
    where: and(
      eq(members.organizationId, organizationId),
      eq(members.userId, session.user.id),
    ),
  });

  if (!membership) {
    return jsonError(
      "Forbidden",
      "You are not a member of this organization.",
      403,
    );
  }

  return {
    type: "session",
    organizationId,
    userId: session.user.id,
    memberId: membership.id,
    name: session.user.name,
    email: session.user.email,
  };
}

export async function validateProjectAccess(
  authCtx: AuthContext,
  projectId: string,
): Promise<Project | Response> {
  if (authCtx.type === "apiKey" && authCtx.projectId !== projectId) {
    return jsonError(
      "Forbidden",
      "API key does not have access to this project.",
      403,
    );
  }

  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.parentOrganizationId, authCtx.organizationId),
    ),
  });

  if (!project) {
    return jsonError("Not Found", "Project not found.", 404);
  }

  return project;
}

export function ensureProjectWritable(project: Project): Response | null {
  if (project.lifecycleState === "deleting") {
    return jsonError(
      "Conflict",
      "Project is currently being deleted and cannot accept upload writes.",
      409,
    );
  }

  return null;
}

export async function validateEnvironmentAccess(
  environmentId: string,
  projectId: string,
): Promise<ProjectEnvironment | Response> {
  const environment = await db.query.projectEnvironments.findFirst({
    where: and(
      eq(projectEnvironments.id, environmentId),
      eq(projectEnvironments.projectId, projectId),
    ),
  });

  if (!environment) {
    return jsonError(
      "Not Found",
      "Environment not found or does not belong to this project.",
      404,
    );
  }

  return environment;
}

export function ensureEnvironmentWritable(
  environment: ProjectEnvironment,
): Response | null {
  if (environment.lifecycleState === "deleting") {
    return jsonError(
      "Conflict",
      "Environment is currently being deleted and cannot accept upload writes.",
      409,
    );
  }

  return null;
}
