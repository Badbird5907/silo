import { z } from "zod";

import { buildAuditActorFromAuthResult } from "@silo-storage/api/service/audit";
import {
  deleteFileKey,
  lookupFileKey,
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
  .refine((data) => data.fileKeyId ?? data.accessKey, {
    message: "Either fileKeyId or accessKey must be provided",
  });

type DeleteTransitionResult =
  | { status: "missing" }
  | { status: "already_deleted" }
  | { status: "pending_rejected" }
  | { status: "deleted_without_cleanup" }
  | { status: "transitioned"; fileId: string; storageKey: string };

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
    const fileKey = await lookupFileKey(db, {
      projectId,
      fileKeyId,
      accessKey,
    });

    if (!fileKey) {
      return jsonError("Not Found", "File not found.", 404);
    }

    if (fileKey.environmentId !== environmentId) {
      return jsonError(
        "Forbidden",
        "File does not belong to the specified environment.",
        403,
      );
    }

    if (fileKey.status === "deleted") {
      return new Response(
        JSON.stringify({
          message: "File already deleted",
          projectId: project.id,
          projectName: project.name,
          environmentId: environment.id,
          environmentName: environment.name,
          fileKeyId: fileKey.id,
          accessKey: fileKey.accessKey,
          lifecycleJobs: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const deletionResult = await deleteFileKey(db, {
      projectId,
      environmentId,
      fileKeyId: fileKey.id,
      audit: {
        organizationId: authResult.organizationId,
        actor: buildAuditActorFromAuthResult(authResult),
        clientIp,
      },
    });

    const transitionResult: DeleteTransitionResult =
      deletionResult.status === "not_found"
        ? { status: "missing" }
        : deletionResult.status === "already_deleted"
          ? { status: "already_deleted" }
          : deletionResult.status === "pending_rejected"
            ? { status: "pending_rejected" }
            : deletionResult.status === "deleted_without_cleanup"
              ? { status: "deleted_without_cleanup" }
              : {
                  status: "transitioned",
                  fileId: deletionResult.fileId,
                  storageKey: deletionResult.storageKey,
                };

    if (transitionResult.status === "missing") {
      return jsonError("Not Found", "File not found.", 404);
    }

    if (transitionResult.status === "already_deleted") {
      return new Response(
        JSON.stringify({
          message: "File already deleted",
          projectId: project.id,
          projectName: project.name,
          environmentId: environment.id,
          environmentName: environment.name,
          fileKeyId: fileKey.id,
          accessKey: fileKey.accessKey,
          lifecycleJobs: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (transitionResult.status === "pending_rejected") {
      return jsonError(
        "Bad Request",
        "Pending uploads must be marked as failed instead of deleted.",
        400,
      );
    }

    if (transitionResult.status === "deleted_without_cleanup") {
      return new Response(
        JSON.stringify({
          message: "File deleted",
          projectId: project.id,
          projectName: project.name,
          environmentId: environment.id,
          environmentName: environment.name,
          fileKeyId: fileKey.id,
          accessKey: fileKey.accessKey,
          lifecycleJobs: null,
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const transitioned = transitionResult;

    const drainResult = await runLifecycleJobBatch(db, {
      limit: 20,
      leaseSeconds: 45,
      leaseOwner: "api:v1/delete",
    });

    return new Response(
      JSON.stringify({
        message: "File deletion scheduled",
        projectId: project.id,
        projectName: project.name,
        environmentId: environment.id,
        environmentName: environment.name,
        fileKeyId: fileKey.id,
        accessKey: fileKey.accessKey,
        lifecycleJobs: {
          fileId: transitioned.fileId,
          storageKey: transitioned.storageKey,
          claimed: drainResult.claimed,
          completed: drainResult.completed,
          retried: drainResult.retried,
          dead: drainResult.dead,
        },
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(
        "Bad Request",
        "Invalid request body.",
        400,
        error.issues,
      );
    }

    console.error("Error deleting file:", error);
    return jsonError(
      "Internal Server Error",
      "An unexpected error occurred.",
      500,
    );
  }
}
