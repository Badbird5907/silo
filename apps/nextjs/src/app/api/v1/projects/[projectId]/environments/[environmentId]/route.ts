import { z } from "zod";

import {
  deleteEnvironment,
  updateEnvironment,
} from "@silo-storage/api/services";
import { db } from "@silo-storage/db/client";

import {
  authenticateRequest,
  jsonError,
  jsonResponse,
  validateEnvironmentAccess,
  validateProjectAccess,
} from "@/lib/api-key-middleware";

// GET /api/v1/projects/[projectId]/environments/[environmentId]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; environmentId: string }> },
) {
  const { projectId, environmentId } = await params;

  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const projectResult = await validateProjectAccess(authResult, projectId);
  if (projectResult instanceof Response) return projectResult;

  const environment = await validateEnvironmentAccess(environmentId, projectId);
  if (environment instanceof Response) return environment;

  return jsonResponse(environment);
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["development", "staging", "production"]).optional(),
});

// PATCH /api/v1/projects/[projectId]/environments/[environmentId]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; environmentId: string }> },
) {
  const { projectId, environmentId } = await params;

  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const projectResult = await validateProjectAccess(authResult, projectId);
  if (projectResult instanceof Response) return projectResult;

  const existing = await validateEnvironmentAccess(environmentId, projectId);
  if (existing instanceof Response) return existing;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Bad Request", "Invalid JSON body.", 400);
  }

  const result = updateSchema.safeParse(body);
  if (!result.success) {
    return jsonError(
      "Bad Request",
      "Invalid request body.",
      400,
      result.error.issues,
    );
  }

  try {
    const updated = await updateEnvironment(db, {
      id: environmentId,
      name: result.data.name,
      type: result.data.type,
    });
    return jsonResponse(updated);
  } catch (error) {
    console.error("Error updating environment:", error);
    return jsonError(
      "Internal Server Error",
      "Failed to update environment.",
      500,
    );
  }
}

// DELETE /api/v1/projects/[projectId]/environments/[environmentId]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; environmentId: string }> },
) {
  const { projectId, environmentId } = await params;

  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const projectResult = await validateProjectAccess(authResult, projectId);
  if (projectResult instanceof Response) return projectResult;

  const existing = await validateEnvironmentAccess(environmentId, projectId);
  if (existing instanceof Response) return existing;

  try {
    const deleted = await deleteEnvironment(db, environmentId, projectId);
    return jsonResponse(deleted);
  } catch (error) {
    console.error("Error deleting environment:", error);
    return jsonError(
      "Internal Server Error",
      "Failed to delete environment.",
      500,
    );
  }
}
