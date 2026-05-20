import type { Context } from "hono";

import { getClientIpFromHeaders } from "@silo-storage/shared";

import type { Bindings, Variables } from "../types/bindings";
import {
  areMimeTypesEquivalent,
  detectMimeType,
  isAllowedMimeType,
} from "../lib/file-types";
import { readHeaderBytes } from "../lib/hash";
import {
  registerUploadSession,
  sendUploadCallback,
  verifyUploadSignature,
} from "../services/callback";
import { retry } from "../services/tus/retry";
import { Errors, TusError } from "../utils/errors";

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

function assertProjectUploadWritable(c: AppContext): void {
  if (c.get("projectLifecycleState") === "deleting") {
    throw new TusError(
      "INVALID_REQUEST",
      409,
      "Project is currently being deleted and cannot accept upload writes.",
    );
  }
}

function parsePositiveInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

async function sendUploadFailedCallback(
  input: {
    projectId: string;
    environmentId: string;
    fileKeyId: string;
    clientIp: string | null;
    error: string;
  },
  env: Bindings,
): Promise<void> {
  await retry(
    () =>
      sendUploadCallback(
        {
          contractVersion: 1,
          clientIp: input.clientIp,
          type: "upload-failed",
          data: {
            environmentId: input.environmentId,
            fileKeyId: input.fileKeyId,
            projectId: input.projectId,
            error: input.error,
          },
        },
        env,
      ),
    { maxAttempts: 4, baseDelayMs: 250, maxDelayMs: 2000 },
  );
}

export async function handleDirectUpload(c: AppContext): Promise<Response> {
  assertProjectUploadWritable(c);

  const projectId: string = c.get("projectId");
  const environmentId = c.req.query("environmentId");
  const fileKeyId = c.req.query("fileKeyId");
  const accessKey = c.req.query("accessKey");
  const fileName = c.req.query("fileName");
  const keyId = c.req.query("keyId");
  const signature = c.req.query("sig");
  const sizeParam = c.req.query("size");
  const hash = c.req.query("hash") ?? undefined;
  const mimeType = c.req.query("mimeType") ?? undefined;
  const acceptedMimeTypes = c.req.query("acceptedMimeTypes") ?? undefined;
  const expiresAt = c.req.query("expiresAt") ?? undefined;
  const isPublic = c.req.query("isPublic") ?? undefined;

  if (
    !environmentId ||
    !fileKeyId ||
    !accessKey ||
    !fileName ||
    !keyId ||
    !signature ||
    !sizeParam
  ) {
    throw Errors.invalidRequest(
      "Missing required parameters: environmentId, fileKeyId, accessKey, fileName, keyId, size, sig",
    );
  }

  const verificationResult = await verifyUploadSignature(
    {
      keyId,
      signature,
      payload: {
        type: "upload",
        environmentId,
        fileKeyId,
        accessKey,
        fileName,
        size: sizeParam,
        keyId,
        ...(hash ? { hash } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(acceptedMimeTypes ? { acceptedMimeTypes } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...(isPublic ? { isPublic } : {}),
        uploadMethod: "put",
      },
    },
    c.env,
  );

  if (!verificationResult.valid) {
    throw Errors.signatureInvalid();
  }

  if (
    verificationResult.projectId &&
    verificationResult.projectId !== projectId
  ) {
    throw Errors.unauthorized(
      "Signed upload URL does not belong to this project",
    );
  }

  const expectedSize = verificationResult.size;
  if (expectedSize === undefined) {
    throw Errors.invalidRequest("Signed upload URL is missing a file size");
  }

  const maxSize = Number.parseInt(c.env.TUS_MAX_SIZE, 10);
  if (expectedSize > maxSize) {
    throw Errors.uploadTooLarge(expectedSize, maxSize);
  }

  const contentLength = parsePositiveInt(c.req.header("Content-Length"));
  if (expectedSize > 0 && contentLength === null) {
    throw Errors.invalidRequest("Content-Length header is required");
  }
  if (contentLength !== null && contentLength !== expectedSize) {
    throw Errors.sizeMismatch(expectedSize, contentLength);
  }

  const storageKey = `${projectId}/${environmentId}/${crypto.randomUUID()}`;
  const uploadId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const clientIp: string | null = getClientIpFromHeaders(c.req.raw.headers);

  await registerUploadSession(
    {
      projectId,
      environmentId,
      fileKeyId,
      uploadId,
      storageKey,
    },
    c.env,
  );

  const body =
    expectedSize === 0
      ? new Uint8Array(0)
      : ((c.req.raw.body as ReadableStream<Uint8Array> | null) ??
        (() => {
          throw Errors.invalidRequest("Request body is required");
        })());

  try {
    await c.env.R2_BUCKET.put(storageKey, body);

    const storedObject = await c.env.R2_BUCKET.get(storageKey);
    if (!storedObject) {
      throw new Error("Uploaded object is missing after write");
    }

    const actualSize = storedObject.size;
    if (actualSize !== expectedSize) {
      throw Errors.sizeMismatch(expectedSize, actualSize);
    }

    const headerBytes = await readHeaderBytes(
      storedObject.body as ReadableStream<Uint8Array>,
      8192,
    );
    const actualMimeType = await detectMimeType(headerBytes, fileName);
    const actualHash = verificationResult.claimedHash ?? null;

    if (
      verificationResult.claimedMimeType &&
      actualMimeType !== "application/octet-stream" &&
      !areMimeTypesEquivalent(
        verificationResult.claimedMimeType,
        actualMimeType,
        fileName,
      )
    ) {
      throw Errors.mimeTypeMismatch(
        verificationResult.claimedMimeType,
        actualMimeType,
      );
    }

    if (
      verificationResult.acceptedMimeTypes &&
      verificationResult.acceptedMimeTypes.length > 0 &&
      !isAllowedMimeType(
        actualMimeType,
        verificationResult.acceptedMimeTypes,
        fileName,
      )
    ) {
      throw Errors.mimeTypeNotAllowed(
        actualMimeType,
        verificationResult.acceptedMimeTypes,
      );
    }

    await retry(
      () =>
        sendUploadCallback(
          {
            contractVersion: 1,
            clientIp,
            type: "upload-completed",
            data: {
              environmentId,
              fileKeyId,
              accessKey,
              fileName,
              claimedSize: verificationResult.size ?? actualSize,
              claimedHash: verificationResult.claimedHash ?? null,
              claimedMimeType: verificationResult.claimedMimeType ?? null,
              actualHash,
              actualMimeType,
              actualSize,
              storage: {
                provider: "r2",
                objectKey: storageKey,
              },
              adapterKey: storageKey,
              projectId,
              isPublic: verificationResult.isPublic ?? false,
            },
          },
          c.env,
        ),
      { maxAttempts: 4, baseDelayMs: 250, maxDelayMs: 2000 },
    );

    return c.json(
      {
        success: true,
        fileKeyId,
        accessKey,
        uploadMethod: "put",
      },
      201,
    );
  } catch (error) {
    await c.env.R2_BUCKET.delete(storageKey).catch((deleteError: unknown) => {
      console.error("Failed to delete direct upload object after error", {
        storageKey,
        deleteError,
      });
    });

    await sendUploadFailedCallback(
      {
        projectId,
        environmentId,
        fileKeyId,
        clientIp,
        error: error instanceof Error ? error.message : "Direct upload failed",
      },
      c.env,
    ).catch((callbackError: unknown) => {
      console.error("Failed to send direct upload failure callback", {
        projectId,
        environmentId,
        fileKeyId,
        storageKey,
        callbackError,
      });
    });

    throw error;
  }
}
