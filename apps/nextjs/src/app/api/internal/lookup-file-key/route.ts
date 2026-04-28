import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { apiKeys, fileKeys } from "@silo-storage/db/schema";
import { deriveSigningSecretFromHash } from "@silo-storage/shared/signing";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";
import { env } from "@/env";

export async function POST(request: Request) {
  if (!isCallbackAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const { accessKey, projectId } = body as {
      accessKey?: string;
      projectId?: string;
      signingKeyId?: string;
    };
    const signingKeyId =
      typeof (body as { signingKeyId?: unknown }).signingKeyId === "string"
        ? (body as { signingKeyId?: string }).signingKeyId
        : undefined;

    if (!accessKey || !projectId) {
      return new Response(
        JSON.stringify({ error: "accessKey and projectId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const fileKey = await db.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.accessKey, accessKey),
        eq(fileKeys.projectId, projectId),
      ),
      with: {
        file: true,
      },
    });

    if (!fileKey) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (fileKey.status === "deleted" || !fileKey.file) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let downloadSigningSecret: string | null = null;

    if (signingKeyId) {
      const apiKey = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.id, signingKeyId),
        columns: {
          projectId: true,
          environmentId: true,
          keyHash: true,
          expiresAt: true,
        },
      });

      const apiKeyExpired =
        apiKey?.expiresAt instanceof Date && apiKey.expiresAt <= new Date();
      if (
        apiKey?.keyHash &&
        apiKey.projectId === fileKey.projectId &&
        apiKey.environmentId === fileKey.environmentId &&
        !apiKeyExpired
      ) {
        downloadSigningSecret = await deriveSigningSecretFromHash(
          apiKey.keyHash,
          env.SIGNING_SECRET,
        );
      }
    }

    const responseBody = {
      ...fileKey,
      downloadSigningSecret,
      serveImage: fileKey.serveImage,
      file: {
        ...fileKey.file,
        adapterKey: fileKey.file.storageKey,
      },
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error looking up file key:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
