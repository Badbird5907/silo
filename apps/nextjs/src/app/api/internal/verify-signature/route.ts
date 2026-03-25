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

export async function POST(request: Request) {
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

  try {
    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
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

    const apiKey = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyPrefix, keyId),
      with: {
        project: true,
      },
    });

    if (!apiKey) {
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

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      console.log("[verify-signature] API key expired", {
        keyId,
        expiresAt: apiKey.expiresAt,
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

    const environment = await db.query.projectEnvironments.findFirst({
      where: eq(projectEnvironments.id, payload.environmentId),
    });

    if (!environment) {
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

    const fileKey = await db.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.id, payload.fileKeyId),
        eq(fileKeys.projectId, apiKey.projectId),
        eq(fileKeys.environmentId, payload.environmentId),
        eq(fileKeys.accessKey, payload.accessKey),
      ),
      columns: {
        id: true,
        status: true,
      },
    });

    if (!fileKey) {
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

    // The API key is stored as a hash, but we need the original key to verify the signature.
    // Since we can't reverse the hash, we need to store the key differently.
    // For now, we'll use a workaround: the signing secret is derived from the key hash + a salt.
    // This way, anyone with the original API key can generate the same signing secret.
    //
    // signingSecret = HMAC(SIGNING_SECRET, keyHash)
    //
    // The client SDK knows the full API key, so it can compute:
    // 1. keyHash = SHA256(apiKey)
    // 2. signingSecret = HMAC(SIGNING_SECRET, keyHash)
    // 3. signature = HMAC(signingSecret, payload)
    //
    // We can do the same here since we have keyHash stored.

    const signingSecretData = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SIGNING_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const derivedSecretBuffer = await crypto.subtle.sign(
      "HMAC",
      signingSecretData,
      new TextEncoder().encode(apiKey.keyHash),
    );

    const derivedSecret = Array.from(new Uint8Array(derivedSecretBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

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

    const expectedSignature = await createSignature(
      payloadForSigning,
      derivedSecret,
    );

    if (!timingSafeEqual(signature, expectedSignature)) {
      console.log("[verify-signature] Invalid signature", {
        keyId,
        providedSignature: signature.substring(0, 10) + "...",
        expectedSignature: expectedSignature.substring(0, 10) + "...",
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

    const parsedSize = Number(payload.size);
    if (!Number.isSafeInteger(parsedSize) || parsedSize < 0) {
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
