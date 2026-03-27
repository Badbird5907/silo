import { z } from "zod";

import {
  enqueueDeleteObjectJob,
  enqueueFinalizeFailedFileKeyJob,
  lookupFileKey,
  runLifecycleJobBatch,
} from "@silo-storage/api/services";
import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys } from "@silo-storage/db/schema";
import { clearUploadSessionAdapterData } from "@silo-storage/shared";

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
  | { status: "no_file" }
  | { status: "transitioned"; fileId: string; storageKey: string };

export async function POST(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  // Parse request body
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

  // Validate project access
  const project = await validateProjectAccess(authResult, projectId);
  if (project instanceof Response) return project;

  // Validate environment access
  const environment = await validateEnvironmentAccess(environmentId, projectId);
  if (environment instanceof Response) return environment;

  try {
    // Find the file key by either identifier
    const fileKey = await lookupFileKey(db, {
      projectId,
      fileKeyId,
      accessKey,
    });

    if (!fileKey) {
      return jsonError("Not Found", "File not found.", 404);
    }

    // Idempotent success if already deleted/failed and no file remains
    if (!fileKey.file && fileKey.status === "failed") {
      return new Response(
        JSON.stringify({
          message: "File already deleted",
          projectId: project.id,
          projectName: project.name,
          environmentId: environment.id,
          environmentName: environment.name,
          fileKeyId: fileKey.id,
          accessKey: fileKey.accessKey,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if the file has been uploaded (fileId is set)
    if (!fileKey.file) {
      return jsonError("Not Found", "File has not been uploaded yet.", 404);
    }

    // Check environment ownership
    if (fileKey.environmentId !== environmentId) {
      return jsonError(
        "Forbidden",
        "File does not belong to the specified environment.",
        403,
      );
    }

    const transitionResult: DeleteTransitionResult = await db.transaction(
      async (tx) => {
        const current = await tx.query.fileKeys.findFirst({
          where: and(
            eq(fileKeys.id, fileKey.id),
            eq(fileKeys.projectId, projectId),
          ),
          with: { file: true },
        });

        if (!current) {
          return { status: "missing" };
        }

        if (!current.file) {
          return {
            status: current.status === "failed" ? "already_deleted" : "no_file",
          };
        }

        await tx
          .update(fileKeys)
          .set({
            status: "failed",
            uploadFailedAt: new Date(),
            adapterData: clearUploadSessionAdapterData(current.adapterData),
          })
          .where(eq(fileKeys.id, current.id));

        await enqueueDeleteObjectJob(tx, {
          projectId,
          environmentId,
          fileKeyId: current.id,
          fileId: current.file.id,
          storageKey: current.file.storageKey,
          priority: 120,
        });

        await enqueueFinalizeFailedFileKeyJob(tx, {
          projectId,
          environmentId,
          fileKeyId: current.id,
          fileId: current.file.id,
          priority: 100,
        });

        return {
          status: "transitioned",
          fileId: current.file.id,
          storageKey: current.file.storageKey,
        };
      },
    );

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
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (transitionResult.status === "no_file") {
      return jsonError("Not Found", "File has not been uploaded yet.", 404);
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
