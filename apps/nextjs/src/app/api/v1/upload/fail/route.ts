import { z } from "zod";

import { buildAuditActorFromAuthResult } from "@silo-storage/api/service/audit";
import {
  lookupFileKey,
  markUploadAsFailed,
  UploadFailureError,
} from "@silo-storage/api/service/fileKey";
import { runLifecycleJobBatch } from "@silo-storage/api/service/lifecycleJob";
import { db } from "@silo-storage/db/client";
import { getClientIpFromHeaders } from "@silo-storage/shared";

import {
  authenticateRequest,
  jsonError,
  validateEnvironmentAccess,
  validateProjectAccess,
} from "@/lib/api-key-middleware";

const schema = z
  .object({
    projectId: z.string(),
    environmentId: z.string(),
    fileKeyId: z.string().optional(),
    accessKey: z.string().optional(),
  })
  .refine((data) => !!data.fileKeyId || !!data.accessKey, {
    message: "Either fileKeyId or accessKey must be provided",
  });

export async function POST(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;
  const clientIp = getClientIpFromHeaders(request.headers);

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

  const { projectId, environmentId, fileKeyId, accessKey } = result.data;

  const project = await validateProjectAccess(authResult, projectId);
  if (project instanceof Response) return project;

  const environment = await validateEnvironmentAccess(environmentId, projectId);
  if (environment instanceof Response) return environment;

  try {
    // Look up the file key by either identifier
    const fileKey = await lookupFileKey(db, {
      projectId,
      fileKeyId,
      accessKey,
    });

    if (!fileKey) {
      return jsonError("Not Found", "File key not found.", 404);
    }

    if (fileKey.environmentId !== environmentId) {
      return jsonError(
        "Forbidden",
        "File key does not belong to the specified environment.",
        403,
      );
    }

    const updated = await markUploadAsFailed(db, {
      projectId,
      environmentId,
      fileKeyId: fileKey.id,
      error: "Upload marked as failed via API",
      actor: buildAuditActorFromAuthResult(authResult),
      clientIp,
    });

    const drainResult = await runLifecycleJobBatch(db, {
      limit: 20,
      leaseSeconds: 45,
      leaseOwner: "api:v1/upload/fail",
    });

    return new Response(
      JSON.stringify({
        success: true,
        fileKeyId: updated.id,
        accessKey: updated.accessKey,
        status: "failed",
        lifecycleJobs: drainResult,
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    if (error instanceof UploadFailureError) {
      const statusCode = error.code === "NOT_FOUND" ? 404 : 400;
      return jsonError(
        error.code === "NOT_FOUND" ? "Not Found" : "Bad Request",
        error.message,
        statusCode,
      );
    }

    console.error("Error marking upload as failed:", error);
    return jsonError(
      "Internal Server Error",
      "An unexpected error occurred.",
      500,
    );
  }
}
