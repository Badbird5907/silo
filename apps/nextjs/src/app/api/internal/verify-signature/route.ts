import { z } from "zod";

import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import {
  apiKeys,
  fileKeys,
  projectEnvironments,
} from "@silo-storage/db/schema";
import { normalizeFileRouterInputKey } from "@silo-storage/mime-types";
import {
  parseAcceptedMimeTypePatterns,
  serializeAcceptedMimeTypePatterns,
} from "@silo-storage/shared/signing";

import { env } from "@/env";

/**
 * Internal endpoint for Cloudflare Worker to verify upload URL signatures.
 *
 * The worker cannot verify signatures directly because API keys are stored as hashes.
 * Instead, the worker calls this endpoint with the signature payload, and we verify it
 * by looking up the API key and checking the signature.
 *
 * This endpoint also returns information needed by the worker to proceed with the upload.
 */

const schema = z.object({
  keyId: z.string(),
  signature: z.string(),
  payload: z.object({
    type: z.literal("upload"),
    environmentId: z.string(),
    fileKeyId: z.string(),
    accessKey: z.string(),
    fileName: z.string(),
    size: z.string(),
    keyId: z.string(),
    hash: z.string().optional(),
    mimeType: z.string().optional(),
    acceptedMimeTypes: z.string().optional(),
    expiresAt: z.string().optional(),
    isPublic: z.string().optional(),
  }),
});

const VERIFY_SIGNATURE_DIAG_VERSION = "2026-03-30.4";

function getDbTargetLabel(): string | null {
  const raw = env.POSTGRES_URL;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return null;
  }
}

async function createSignature(
  payload: Record<string, string>,
  secret: string,
): Promise<string> {
  const sortedKeys = Object.keys(payload).sort();
  const message = sortedKeys.map((key) => `${key}=${payload[key]}`).join("&");

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    messageData,
  );

  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findPendingFileKeyWithRetry(input: {
  fileKeyId: string;
  projectId: string;
  environmentId: string;
  accessKey: string;
}): Promise<{ id: string; status: string } | null> {
  // In production we can occasionally see very short read-after-write gaps
  // between upload registration and signature verification.
  const delaysMs = [0, 150, 500, 1200] as const;

  for (const delayMs of delaysMs) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const fileKey = await db.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.id, input.fileKeyId),
        eq(fileKeys.projectId, input.projectId),
        eq(fileKeys.environmentId, input.environmentId),
        eq(fileKeys.accessKey, input.accessKey),
      ),
      columns: {
        id: true,
        status: true,
      },
    });

    if (fileKey) {
      return fileKey;
    }
  }

  return null;
}

export async function POST(request: Request) {
  console.log("[verify-signature] Diagnostic context", {
    diagVersion: VERIFY_SIGNATURE_DIAG_VERSION,
    dbTarget: getDbTargetLabel(),
  });

  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    console.log(
      "[verify-signature] Missing or invalid Authorization header format",
      {
        header: header ? "present" : "missing",
      },
    );
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const token = header.split(" ")[1];
  if (token !== env.CALLBACK_SECRET) {
    console.log("[verify-signature] Invalid CALLBACK_SECRET token", {
      tokenLength: token?.length,
      expectedLength: env.CALLBACK_SECRET.length,
    });
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  console.log("[verify-signature] CALLBACK_SECRET token is valid")

  try {
    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      console.log("[verify-signature] Invalid request")
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          details: parsed.error.issues,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { keyId, signature, payload } = parsed.data;

    let acceptedMimeTypes: string[] | undefined;
    try {
      const parsedAcceptedMimeTypes = parseAcceptedMimeTypePatterns(
        payload.acceptedMimeTypes,
      );
      acceptedMimeTypes = parsedAcceptedMimeTypes?.map((value) =>
        normalizeFileRouterInputKey(value),
      );
    } catch (error) {
      console.log("[verify-signature] Invalid acceptedMimeTypes", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Invalid acceptedMimeTypes",
          valid: false,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const apiKeyCandidates = await db.query.apiKeys.findMany({
      where: eq(apiKeys.keyPrefix, keyId),
      with: {
        project: true,
      },
    });

    if (apiKeyCandidates.length === 0) {
      console.log("[verify-signature] API key not found", {
        keyId,
      });
      return new Response(
        JSON.stringify({
          error: "Invalid API key",
          valid: false,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (payload.expiresAt) {
      const expiresAt = parseInt(payload.expiresAt, 10);
      const now = Math.floor(Date.now() / 1000);
      if (now > expiresAt) {
        console.log("[verify-signature] Signed URL has expired", {
          expiresAt,
          now,
        });
        return new Response(
          JSON.stringify({
            error: "Signed URL has expired",
            valid: false,
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    const payloadForSigning: Record<string, string> = {
      type: payload.type,
      environmentId: payload.environmentId,
      fileKeyId: payload.fileKeyId,
      accessKey: payload.accessKey,
      fileName: payload.fileName,
      size: payload.size,
      keyId: payload.keyId,
    };
    if (payload.hash) payloadForSigning.hash = payload.hash;
    if (payload.mimeType) payloadForSigning.mimeType = payload.mimeType;
    if (acceptedMimeTypes) {
      payloadForSigning.acceptedMimeTypes =
        serializeAcceptedMimeTypePatterns(acceptedMimeTypes) ?? "";
    }
    if (payload.expiresAt) payloadForSigning.expiresAt = payload.expiresAt;
    if (payload.isPublic) payloadForSigning.isPublic = payload.isPublic;

    const signingSecretData = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SIGNING_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const activeCandidates = apiKeyCandidates.filter(
      (candidate) =>
        !candidate.expiresAt || new Date(candidate.expiresAt) >= new Date(),
    );

    if (activeCandidates.length > 1) {
      console.warn("[verify-signature] API key prefix collision detected", {
        keyId,
        activeCandidateCount: activeCandidates.length,
      });
    }

    if (activeCandidates.length === 0) {
      console.log("[verify-signature] All API keys for prefix are expired", {
        keyId,
        candidateCount: apiKeyCandidates.length,
      });
      return new Response(
        JSON.stringify({
          error: "API key expired",
          valid: false,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let apiKey: (typeof apiKeyCandidates)[number] | null = null;
    for (const candidate of activeCandidates) {
      const derivedSecretBuffer = await crypto.subtle.sign(
        "HMAC",
        signingSecretData,
        new TextEncoder().encode(candidate.keyHash),
      );

      const derivedSecret = Array.from(new Uint8Array(derivedSecretBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const expectedSignature = await createSignature(
        payloadForSigning,
        derivedSecret,
      );

      if (timingSafeEqual(signature, expectedSignature)) {
        apiKey = candidate;
        break;
      }
    }

    if (!apiKey) {
      console.log("[verify-signature] Invalid signature", {
        keyId,
        candidateCount: activeCandidates.length,
        providedSignature: signature.substring(0, 10) + "...",
      });
      return new Response(
        JSON.stringify({
          error: "Invalid signature",
          valid: false,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const environment = await db.query.projectEnvironments.findFirst({
      where: eq(projectEnvironments.id, payload.environmentId),
    });

    if (!environment) {
      console.log("[verify-signature] Environment not found", {
        environmentId: payload.environmentId,
      });
      return new Response(
        JSON.stringify({
          error: "Environment not found",
          valid: false,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (environment.projectId !== apiKey.projectId) {
      console.log("[verify-signature] Environment does not belong to the API key's project", {
        environmentId: payload.environmentId,
        projectId: apiKey.projectId,
        environmentProjectId: environment.projectId,
      });
      return new Response(
        JSON.stringify({
          error: "Environment does not belong to the API key's project",
          valid: false,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!apiKey.environmentId) {
      console.log("[verify-signature] API key must be scoped to an environment", {
        apiKeyId: apiKey.id,
      });
      return new Response(
        JSON.stringify({
          error: "API key must be scoped to an environment",
          valid: false,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (apiKey.environmentId !== payload.environmentId) {
      console.log("[verify-signature] API key is not authorized for this environment", {
        apiKeyId: apiKey.id,
        environmentId: payload.environmentId,
        apiKeyEnvironmentId: apiKey.environmentId,
      });
      return new Response(
        JSON.stringify({
          error: "API key is not authorized for this environment",
          valid: false,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (apiKey.project.lifecycleState === "deleting") {
      console.log("[verify-signature] Project is currently deleting", {
        projectId: apiKey.projectId,
      });
      return new Response(
        JSON.stringify({
          error: "Project is currently deleting",
          valid: false,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (environment.lifecycleState === "deleting") {
      console.log("[verify-signature] Environment is currently deleting", {
        environmentId: payload.environmentId,
      });
      return new Response(
        JSON.stringify({
          error: "Environment is currently deleting",
          valid: false,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const fileKey = await findPendingFileKeyWithRetry({
      fileKeyId: payload.fileKeyId,
      projectId: apiKey.projectId,
      environmentId: payload.environmentId,
      accessKey: payload.accessKey,
    });

    if (!fileKey) {
      const [fileKeyById, fileKeyByAccess, fileKeyByIdAnyScope, fileKeyByAccessAnyScope] =
        await Promise.all([
        db.query.fileKeys.findFirst({
          where: and(
            eq(fileKeys.id, payload.fileKeyId),
            eq(fileKeys.projectId, apiKey.projectId),
            eq(fileKeys.environmentId, payload.environmentId),
          ),
          columns: {
            id: true,
            accessKey: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        db.query.fileKeys.findFirst({
          where: and(
            eq(fileKeys.accessKey, payload.accessKey),
            eq(fileKeys.projectId, apiKey.projectId),
            eq(fileKeys.environmentId, payload.environmentId),
          ),
          columns: {
            id: true,
            accessKey: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        db.query.fileKeys.findFirst({
          where: eq(fileKeys.id, payload.fileKeyId),
          columns: {
            id: true,
            accessKey: true,
            status: true,
            projectId: true,
            environmentId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        db.query.fileKeys.findFirst({
          where: eq(fileKeys.accessKey, payload.accessKey),
          columns: {
            id: true,
            accessKey: true,
            status: true,
            projectId: true,
            environmentId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      console.log("[verify-signature] File key not found", {
        fileKeyId: payload.fileKeyId,
        projectId: apiKey.projectId,
        environmentId: payload.environmentId,
        accessKey: payload.accessKey,
      });
      console.log("[verify-signature] File key lookup diagnostics", {
        requestedFileKeyId: payload.fileKeyId,
        requestedAccessKey: payload.accessKey,
        fileKeyById: fileKeyById
          ? {
              id: fileKeyById.id,
              status: fileKeyById.status,
              accessKeyMatches: fileKeyById.accessKey === payload.accessKey,
              createdAt: fileKeyById.createdAt,
              updatedAt: fileKeyById.updatedAt,
            }
          : null,
        fileKeyByAccess: fileKeyByAccess
          ? {
              id: fileKeyByAccess.id,
              status: fileKeyByAccess.status,
              fileKeyIdMatches: fileKeyByAccess.id === payload.fileKeyId,
              createdAt: fileKeyByAccess.createdAt,
              updatedAt: fileKeyByAccess.updatedAt,
            }
          : null,
        fileKeyByIdAnyScope: fileKeyByIdAnyScope
          ? {
              id: fileKeyByIdAnyScope.id,
              status: fileKeyByIdAnyScope.status,
              projectId: fileKeyByIdAnyScope.projectId,
              environmentId: fileKeyByIdAnyScope.environmentId,
              accessKeyMatches:
                fileKeyByIdAnyScope.accessKey === payload.accessKey,
              createdAt: fileKeyByIdAnyScope.createdAt,
              updatedAt: fileKeyByIdAnyScope.updatedAt,
            }
          : null,
        fileKeyByAccessAnyScope: fileKeyByAccessAnyScope
          ? {
              id: fileKeyByAccessAnyScope.id,
              status: fileKeyByAccessAnyScope.status,
              projectId: fileKeyByAccessAnyScope.projectId,
              environmentId: fileKeyByAccessAnyScope.environmentId,
              fileKeyIdMatches:
                fileKeyByAccessAnyScope.id === payload.fileKeyId,
              createdAt: fileKeyByAccessAnyScope.createdAt,
              updatedAt: fileKeyByAccessAnyScope.updatedAt,
            }
          : null,
      });
      return new Response(
        JSON.stringify({
          error: "File key not found",
          valid: false,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (fileKey.status !== "pending") {
      console.log("[verify-signature] File key is not pending", {
        fileKeyId: payload.fileKeyId,
        projectId: apiKey.projectId,
        environmentId: payload.environmentId,
        accessKey: payload.accessKey,
        status: fileKey.status,
      });
      return new Response(
        JSON.stringify({
          error: "File key is not pending",
          valid: false,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const parsedSize = Number(payload.size);
    if (!Number.isSafeInteger(parsedSize) || parsedSize < 0) {
      console.log("[verify-signature] Invalid size", {
        size: payload.size,
        parsedSize,
      });
      return new Response(
        JSON.stringify({
          error: "Invalid size",
          valid: false,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, apiKey.id));

    console.log("[verify-signature] Signature is valid", {
      projectId: apiKey.projectId,
      environmentId: payload.environmentId,
      fileKeyId: payload.fileKeyId,
      accessKey: payload.accessKey,
    });

    return new Response(
      JSON.stringify({
        valid: true,
        projectId: apiKey.projectId,
        environmentId: payload.environmentId,
        fileKeyId: payload.fileKeyId,
        accessKey: payload.accessKey,
        fileName: payload.fileName,
        size: parsedSize,
        claimedHash: payload.hash ?? null,
        claimedMimeType: payload.mimeType ?? null,
        acceptedMimeTypes: acceptedMimeTypes ?? null,
        isPublic: payload.isPublic === "true",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error verifying signature:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        valid: false,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
