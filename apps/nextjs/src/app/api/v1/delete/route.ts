import { z } from "zod";

import { lookupFileKey } from "@silo-storage/api/services";
import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys, files } from "@silo-storage/db/schema";

import { env } from "@/env";
import {
  authenticateRequest,
  jsonError,
  validateEnvironmentAccess,
  validateProjectAccess,
} from "@/lib/api-key-middleware";

const deletePendingSchema = z.object({
  fileId: z.string().min(1),
  adapterKey: z.string().min(1),
  updatedAt: z.string().optional(),
});

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
  | { status: "transitioned"; fileId: string; adapterKey: string };

function readDeletePending(metadata: unknown): {
  fileId: string;
  adapterKey: string;
} | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const pending = (metadata as Record<string, unknown>).deletePending;
  const parsed = deletePendingSchema.safeParse(pending);
  if (!parsed.success) return null;

  return {
    fileId: parsed.data.fileId,
    adapterKey: parsed.data.adapterKey,
  };
}

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
      const deletePending = readDeletePending(fileKey.callbackMetadata);

      if (deletePending) {
        const deleteUrl = `${env.WORKER_URL}/internal/delete/${encodeURIComponent(deletePending.adapterKey)}`;
        const deleteResponse = await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${env.CALLBACK_SECRET}`,
          },
        });

        if (!deleteResponse.ok) {
          return jsonError(
            "Internal Server Error",
            "Delete reconciliation still pending. Retry shortly.",
            500,
          );
        }

        await db
          .delete(files)
          .where(eq(files.id, deletePending.fileId))
          .catch((error) => {
            console.error("Reconciliation file-row delete failed", {
              fileId: deletePending.fileId,
              adapterKey: deletePending.adapterKey,
              error,
            });
          });

        const callbackMetadata =
          fileKey.callbackMetadata &&
          typeof fileKey.callbackMetadata === "object" &&
          !Array.isArray(fileKey.callbackMetadata)
            ? { ...(fileKey.callbackMetadata as Record<string, unknown>) }
            : {};

        delete callbackMetadata.deletePending;

        await db
          .update(fileKeys)
          .set({ callbackMetadata })
          .where(eq(fileKeys.id, fileKey.id));
      }

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
            fileId: null,
            callbackMetadata: {
              ...(current.callbackMetadata &&
              typeof current.callbackMetadata === "object" &&
              !Array.isArray(current.callbackMetadata)
                ? (current.callbackMetadata as Record<string, unknown>)
                : {}),
              deletePending: {
                fileId: current.file.id,
                adapterKey: current.file.adapterKey,
                updatedAt: new Date().toISOString(),
              },
            },
          })
          .where(eq(fileKeys.id, current.id));

        return {
          status: "transitioned",
          fileId: current.file.id,
          adapterKey: current.file.adapterKey,
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

    if (transitionResult.status !== "transitioned") {
      return jsonError(
        "Internal Server Error",
        "Unexpected delete state.",
        500,
      );
    }

    const transitioned = transitionResult;

    let storageDeleted = false;
    let lastStorageErrorDetails = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const deleteUrl = `${env.WORKER_URL}/internal/delete/${encodeURIComponent(transitioned.adapterKey)}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${env.CALLBACK_SECRET}`,
        },
      });

      if (deleteResponse.ok) {
        storageDeleted = true;
        break;
      }

      lastStorageErrorDetails = await deleteResponse.text().catch(() => "");
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }

    if (!storageDeleted) {
      console.error("Database transitioned but storage delete failed", {
        fileId: transitioned.fileId,
        adapterKey: transitioned.adapterKey,
        details: lastStorageErrorDetails,
      });
      return jsonError(
        "Internal Server Error",
        "Database state updated; storage cleanup pending. Retry shortly.",
        500,
      );
    }

    await db
      .delete(files)
      .where(eq(files.id, transitioned.fileId))
      .catch((error) => {
        console.error("Storage deleted but file-row delete failed", {
          fileId: transitioned.fileId,
          adapterKey: transitioned.adapterKey,
          error,
        });
      });

    const callbackMetadata =
      fileKey.callbackMetadata &&
      typeof fileKey.callbackMetadata === "object" &&
      !Array.isArray(fileKey.callbackMetadata)
        ? { ...(fileKey.callbackMetadata as Record<string, unknown>) }
        : {};

    delete callbackMetadata.deletePending;

    await db
      .update(fileKeys)
      .set({ callbackMetadata })
      .where(eq(fileKeys.id, fileKey.id));

    return new Response(
      JSON.stringify({
        message: "File deleted successfully",
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
