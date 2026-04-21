import { z } from "zod";

import { updateFileKeyAccess } from "@silo-storage/api/service/fileKey";
import { db } from "@silo-storage/db/client";

import {
  authenticateRequest,
  jsonError,
  jsonResponse,
  validateEnvironmentAccess,
  validateProjectAccess,
} from "@/lib/api-key-middleware";
import { buildAuditActorFromAuthResult } from "@silo-storage/api/service/audit";

const bodySchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  isPublic: z.boolean(),
  serveImage: z.boolean().optional(),
});

// PATCH /api/v1/files/[fileKeyId]/access
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ fileKeyId: string }> },
) {
  const { fileKeyId } = await params;

  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Bad Request", "Invalid JSON body.", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "Bad Request",
      "Invalid request body.",
      400,
      parsed.error.issues,
    );
  }

  const input = parsed.data;

  const project = await validateProjectAccess(authResult, input.projectId);
  if (project instanceof Response) return project;

  const environment = await validateEnvironmentAccess(
    input.environmentId,
    input.projectId,
  );
  if (environment instanceof Response) return environment;

  try {
    const result = await updateFileKeyAccess(db, {
      projectId: input.projectId,
      fileKeyId,
      isPublic: input.isPublic,
      serveImage: input.serveImage,
      environmentId: input.environmentId,
      actor: buildAuditActorFromAuthResult(authResult)
    });

    if (result.status === "not_found") {
      return jsonError("Not Found", "File key not found.", 404);
    }

    if (result.status === "serve_image_invalid") {
      return jsonError("Bad Request", result.message, 400);
    }

    return jsonResponse({
      id: result.fileKey.id,
      projectId: result.fileKey.projectId,
      environmentId: result.fileKey.environmentId,
      accessKey: result.fileKey.accessKey,
      isPublic: result.fileKey.isPublic,
      serveImage: result.fileKey.serveImage,
    });
  } catch (error) {
    console.error("Error updating file access:", error);
    return jsonError(
      "Internal Server Error",
      "Failed to update file access.",
      500,
    );
  }
}
