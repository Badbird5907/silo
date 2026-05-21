import { z } from "zod";

import {
  createEnvironment,
  listEnvironments,
} from "@silo-storage/api/service/environment";
import { db } from "@silo-storage/db/client";

import {
  authenticateRequest,
  jsonError,
  jsonResponse,
  validateProjectAccess,
} from "@/lib/api-key-middleware";

// GET /api/v1/projects/[projectId]/environments
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const projectResult = await validateProjectAccess(authResult, projectId);
  if (projectResult instanceof Response) return projectResult;

  try {
    const environments = await listEnvironments(db, projectId);
    return jsonResponse(environments);
  } catch (error) {
    console.error("Error listing environments:", error);
    return jsonError(
      "Internal Server Error",
      "Failed to list environments.",
      500,
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["development", "staging", "production"]),
});

// POST /api/v1/projects/[projectId]/environments
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const projectResult = await validateProjectAccess(authResult, projectId);
  if (projectResult instanceof Response) return projectResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Bad Request", "Invalid JSON body.", 400);
  }

  const result = createSchema.safeParse(body);
  if (!result.success) {
    return jsonError(
      "Bad Request",
      "Invalid request body.",
      400,
      result.error.issues,
    );
  }

  try {
    const environment = await createEnvironment(db, {
      projectId,
      name: result.data.name,
      type: result.data.type,
    });
    return jsonResponse(environment, 201);
  } catch (error) {
    console.error("Error creating environment:", error);
    return jsonError(
      "Internal Server Error",
      "Failed to create environment.",
      500,
    );
  }
}
