import { z } from "zod";

import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys } from "@silo-storage/db/schema";

import {
  authenticateRequest,
  jsonError,
  jsonResponse,
  validateEnvironmentAccess,
  validateProjectAccess,
} from "@/lib/api-key-middleware";

const querySchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1).optional(),
});

// GET /api/v1/files/[fileKeyId]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileKeyId: string }> },
) {
  const { fileKeyId } = await params;

  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    projectId: url.searchParams.get("projectId") ?? undefined,
    environmentId: url.searchParams.get("environmentId") ?? undefined,
  });

  if (!parsedQuery.success) {
    return jsonError(
      "Bad Request",
      "Invalid query parameters.",
      400,
      parsedQuery.error.issues,
    );
  }

  const { projectId, environmentId } = parsedQuery.data;

  const project = await validateProjectAccess(authResult, projectId);
  if (project instanceof Response) return project;

  if (environmentId) {
    const environment = await validateEnvironmentAccess(
      environmentId,
      projectId,
    );
    if (environment instanceof Response) return environment;
  }

  try {
    const fileKey = await db.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.id, fileKeyId),
        eq(fileKeys.projectId, projectId),
        ...(environmentId ? [eq(fileKeys.environmentId, environmentId)] : []),
      ),
      with: {
        file: true,
      },
    });

    if (!fileKey) {
      return jsonError("Not Found", "File key not found.", 404);
    }

    return jsonResponse({
      id: fileKey.id,
      fileName: fileKey.fileName,
      accessKey: fileKey.accessKey,
      projectId: fileKey.projectId,
      environmentId: fileKey.environmentId,
      fileId: fileKey.fileId,
      status: fileKey.status,
      isPublic: fileKey.isPublic,
      serveImage: fileKey.serveImage,
      metadata: fileKey.metadata,
      callbackMetadata: fileKey.callbackMetadata,
      claimedHash: fileKey.claimedHash,
      claimedMimeType: fileKey.claimedMimeType,
      claimedSize: fileKey.claimedSize,
      expiresAt: fileKey.expiresAt,
      uploadCompletedAt: fileKey.uploadCompletedAt,
      uploadFailedAt: fileKey.uploadFailedAt,
      deletedAt: fileKey.deletedAt,
      createdAt: fileKey.createdAt,
      updatedAt: fileKey.updatedAt,
      file: fileKey.file
        ? {
            id: fileKey.file.id,
            hash: fileKey.file.hash,
            mimeType: fileKey.file.mimeType,
            size: fileKey.file.size,
            storageKey: fileKey.file.storageKey,
            createdAt: fileKey.file.createdAt,
            updatedAt: fileKey.file.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Error getting file info:", error);
    return jsonError("Internal Server Error", "Failed to get file info.", 500);
  }
}
