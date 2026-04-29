import type { Context } from "hono";

import { getClientIpFromHeaders } from "@silo-storage/shared";

import type { Bindings, Variables } from "../types/bindings";
import type { TusUploadMetadata } from "../types/tus";
import { isAllowedMimeType } from "../lib/file-types";
import {
  detectProjectRouteModeFromPath,
  toProjectScopedPath,
} from "../lib/subdomain";
import {
  registerUploadSession,
  sendUploadCallback,
  verifyUploadSignature,
} from "../services/callback";
import { generateExpirationDate } from "../services/tus/metadata";
import { TUS_EXTENSIONS } from "../types/tus";
import {
  CONTENT_TYPE_OCTET_STREAM,
  HTTP_STATUS,
  TUS_SUPPORTED_VERSIONS_STRING,
  TUS_VERSION,
  UPLOAD_DEFER_LENGTH_HEADER,
  UPLOAD_LENGTH_HEADER,
  UPLOAD_METADATA_HEADER,
  UPLOAD_OFFSET_HEADER,
} from "../utils/constants";
import { Errors, TusError } from "../utils/errors";
import {
  isValidBase64,
  isValidMetadataKey,
  parseNonNegativeInt,
  sanitizeHeaderValue,
} from "../utils/validation";

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

export function handleTusOptions(c: AppContext): Response {
  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: {
      "Tus-Resumable": TUS_VERSION,
      "Tus-Version": TUS_SUPPORTED_VERSIONS_STRING,
      "Tus-Extension": TUS_EXTENSIONS.join(","),
      "Tus-Max-Size": c.env.TUS_MAX_SIZE,
      "Access-Control-Allow-Methods": "POST, GET, HEAD, PATCH, DELETE, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function handleTusHead(c: AppContext): Promise<Response> {
  return await proxyTusHeadToDo(
    c.req.param("uploadId"),
    c.get("projectId"),
    c.req.raw.headers,
    c.env,
  );
}

export async function handleTusPatch(c: AppContext): Promise<Response> {
  assertProjectUploadWritable(c);
  return await proxyTusPatchToDo(
    c.req.param("uploadId"),
    c.get("projectId"),
    c.req.raw.headers,
    c.req.raw.body as ReadableStream<Uint8Array> | null,
    c.env,
  );
}

export async function handleTusDelete(c: AppContext): Promise<Response> {
  return await proxyTusDeleteToDo(
    c.req.param("uploadId"),
    c.get("projectId"),
    c.req.raw.headers,
    c.env,
  );
}

export async function handleTusCreate(c: AppContext): Promise<Response> {
  assertProjectUploadWritable(c);
  const tusResumable = c.req.header("Tus-Resumable");
  if (tusResumable !== TUS_VERSION) {
    throw Errors.invalidTusVersion(TUS_VERSION, tusResumable);
  }

  const projectId: string = c.get("projectId");
  const clientIp: string | null = getClientIpFromHeaders(c.req.raw.headers);
  const uploadLengthHeader = c.req.header(UPLOAD_LENGTH_HEADER);
  const deferLength = c.req.header(UPLOAD_DEFER_LENGTH_HEADER);
  const uploadMetadataHeader = c.req.header(UPLOAD_METADATA_HEADER);
  const contentType = c.req.header("Content-Type");
  const contentLengthHeader = c.req.header("Content-Length");

  if (deferLength !== undefined && deferLength !== "1") {
    throw Errors.invalidRequest("Upload-Defer-Length must be 1");
  }

  if (!uploadLengthHeader && deferLength !== "1") {
    throw Errors.invalidRequest(
      "Missing Upload-Length or Upload-Defer-Length header",
    );
  }

  const uploadLength = parseNonNegativeInt(uploadLengthHeader);
  if (uploadLengthHeader && uploadLength === null) {
    throw Errors.invalidRequest("Upload-Length must be a non-negative integer");
  }

  if (uploadLength !== null) {
    const maxSize = parseInt(c.env.TUS_MAX_SIZE, 10);
    if (uploadLength > maxSize) {
      console.error("Upload too large", { uploadLength, maxSize });
      throw Errors.uploadTooLarge(uploadLength, maxSize);
    }
  }

  const isCreationWithUpload = contentType === CONTENT_TYPE_OCTET_STREAM;
  if (!isCreationWithUpload && contentLengthHeader) {
    const contentLength = parseNonNegativeInt(contentLengthHeader);
    if (contentLength !== null && contentLength !== 0) {
      throw Errors.invalidContentType(CONTENT_TYPE_OCTET_STREAM, contentType);
    }
  }

  const metadata = parseUploadMetadata(uploadMetadataHeader ?? "");

  const environmentId = metadata.environmentId ?? c.req.query("environmentId");
  const fileKeyId = metadata.fileKeyId ?? c.req.query("fileKeyId");
  const accessKey = metadata.accessKey ?? c.req.query("accessKey");
  const fileName = metadata.fileName ?? c.req.query("fileName");
  const keyId = metadata.keyId ?? c.req.query("keyId");
  const signature = c.req.query("sig");
  const sizeParam = c.req.query("size");

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

  try {
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
          ...(c.req.query("hash") && {
            hash: c.req.query("hash") ?? undefined,
          }),
          ...(c.req.query("mimeType") && {
            mimeType: c.req.query("mimeType") ?? undefined,
          }),
          ...(c.req.query("acceptedMimeTypes") && {
            acceptedMimeTypes: c.req.query("acceptedMimeTypes") ?? undefined,
          }),
          ...(c.req.query("expiresAt") && {
            expiresAt: c.req.query("expiresAt") ?? undefined,
          }),
          ...(c.req.query("isPublic") && {
            isPublic: c.req.query("isPublic") ?? undefined,
          }),
        },
      },
      c.env,
    );

    if (!verificationResult.valid) {
      throw Errors.signatureInvalid();
    }

    if (
      uploadLength !== null &&
      verificationResult.size !== undefined &&
      uploadLength !== verificationResult.size
    ) {
      throw Errors.sizeMismatch(verificationResult.size, uploadLength);
    }

    const resolvedUploadSize = uploadLength ?? verificationResult.size ?? null;

    const uploadId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const storageKey = `${projectId}/${environmentId}/${crypto.randomUUID()}`;

    const uploadMetadata: TusUploadMetadata = {
      uploadId,
      projectId,
      environmentId,
      fileKeyId,
      accessKey,
      fileName,
      size: resolvedUploadSize,
      offset: 0,
      storageKey,
      multipartUploadId: null,
      parts: [],
      isPublic: verificationResult.isPublic ?? false,
      claimedHash: verificationResult.claimedHash ?? undefined,
      claimedMimeType: verificationResult.claimedMimeType ?? undefined,
      acceptedMimeTypes: verificationResult.acceptedMimeTypes ?? undefined,
      claimedSize: verificationResult.size,
      createdAt: new Date().toISOString(),
      expiresAt: generateExpirationDate(c.env),
      clientIp,
      metadata,
      rawMetadata: uploadMetadataHeader ?? "",
      callbackDeliveredAt: null,
    };

    const url = new URL(c.req.url);
    const projectSlug = c.get("projectSlug");
    if (!projectSlug) {
      throw Errors.projectNotFound("missing-project-scope");
    }
    const routeMode = detectProjectRouteModeFromPath(url.pathname, projectSlug);

    const uploadLocationPath = toProjectScopedPath(
      `/ingest/tus/${uploadId}`,
      projectSlug,
      routeMode,
    );
    const uploadUrl = `${url.protocol}//${url.host}${uploadLocationPath}`;
    const bodyContentLength = parseNonNegativeInt(contentLengthHeader) ?? 0;
    const body = c.req.raw.body as ReadableStream<Uint8Array> | null;

    if (resolvedUploadSize === 0) {
      if (bodyContentLength > 0) {
        throw Errors.invalidRequest(
          "Creation request body must be empty when Upload-Length is 0",
        );
      }

      const zeroByteMimeType = "application/octet-stream";
      let sessionRegistered = false;
      let objectStored = false;

      try {
        if (
          verificationResult.acceptedMimeTypes &&
          !isAllowedMimeType(
            zeroByteMimeType,
            verificationResult.acceptedMimeTypes,
          )
        ) {
          throw Errors.mimeTypeNotAllowed(
            zeroByteMimeType,
            verificationResult.acceptedMimeTypes,
          );
        }

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
        sessionRegistered = true;

        await c.env.R2_BUCKET.put(storageKey, new Uint8Array(0));
        objectStored = true;

        await sendUploadCallback(
          {
            contractVersion: 1,
            clientIp,
            type: "upload-completed",
            data: {
              environmentId,
              fileKeyId,
              accessKey,
              fileName,
              claimedSize: verificationResult.size,
              claimedHash: verificationResult.claimedHash ?? null,
              claimedMimeType: verificationResult.claimedMimeType ?? null,
              actualHash: null,
              actualMimeType: zeroByteMimeType,
              actualSize: 0,
              storage: {
                provider: "r2",
                objectKey: storageKey,
              },
              adapterKey: storageKey,
              projectId,
              isPublic: verificationResult.isPublic ?? false,
              metadata,
            },
          },
          c.env,
        );
      } catch (error) {
        if (objectStored) {
          await c.env.R2_BUCKET.delete(storageKey).catch(
            (deleteError: unknown) => {
              console.error("Failed to rollback zero-byte upload object", {
                storageKey,
                deleteError,
              });
            },
          );
        }

        if (sessionRegistered) {
          await sendUploadCallback(
            {
              contractVersion: 1,
              clientIp,
              type: "upload-failed",
              data: {
                environmentId,
                fileKeyId,
                projectId,
                error:
                  error instanceof Error
                    ? error.message
                    : "Zero-byte upload failed",
              },
            },
            c.env,
          ).catch((failureCallbackError: unknown) => {
            console.error("Failed to send zero-byte upload failure callback", {
              projectId,
              environmentId,
              fileKeyId,
              storageKey,
              failureCallbackError,
            });
          });
        }

        throw error;
      }

      return new Response(null, {
        status: HTTP_STATUS.CREATED,
        headers: {
          "Tus-Resumable": TUS_VERSION,
          Location: uploadUrl,
          [UPLOAD_OFFSET_HEADER]: "0",
          [UPLOAD_LENGTH_HEADER]: "0",
        },
      });
    }

    await initializeUploadInDo(uploadId, uploadMetadata, c.env);
    try {
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
    } catch (registrationError) {
      const cleanupHeaders = new Headers(c.req.raw.headers);
      cleanupHeaders.set("Tus-Resumable", TUS_VERSION);
      await proxyTusDeleteToDo(
        uploadId,
        projectId,
        cleanupHeaders,
        c.env,
      ).catch((cleanupError: unknown) => {
        console.error("Failed to cleanup upload after registration failure", {
          uploadId,
          storageKey,
          cleanupError,
        });
      });
      throw registrationError;
    }

    if (isCreationWithUpload && bodyContentLength > 0 && body) {
      const patchHeaders = new Headers(c.req.raw.headers);
      patchHeaders.set(UPLOAD_OFFSET_HEADER, "0");
      if (resolvedUploadSize !== null) {
        patchHeaders.set(UPLOAD_LENGTH_HEADER, resolvedUploadSize.toString());
      }
      const patchResponse = await proxyTusPatchToDo(
        uploadId,
        projectId,
        patchHeaders,
        body,
        c.env,
      );
      if (!patchResponse.ok) {
        return patchResponse;
      }
      const nextOffset = patchResponse.headers.get(UPLOAD_OFFSET_HEADER) ?? "0";

      return new Response(null, {
        status: HTTP_STATUS.CREATED,
        headers: {
          "Tus-Resumable": TUS_VERSION,
          Location: uploadUrl,
          "Upload-Expires": uploadMetadata.expiresAt,
          [UPLOAD_OFFSET_HEADER]: nextOffset,
        },
      });
    }

    return new Response(null, {
      status: HTTP_STATUS.CREATED,
      headers: {
        "Tus-Resumable": TUS_VERSION,
        Location: uploadUrl,
        "Upload-Expires": uploadMetadata.expiresAt,
        ...(resolvedUploadSize !== null && {
          [UPLOAD_LENGTH_HEADER]: resolvedUploadSize.toString(),
        }),
      },
    });
  } catch (error) {
    console.error("Upload creation failed:", error);
    throw error;
  }
}

function getTusUploadStub(uploadId: string, env: Bindings): DurableObjectStub {
  const id = env.TUS_STATE_DO.idFromName(uploadId);
  return env.TUS_STATE_DO.get(id);
}

async function initializeUploadInDo(
  uploadId: string,
  metadata: TusUploadMetadata,
  env: Bindings,
): Promise<void> {
  const response = await getTusUploadStub(uploadId, env).fetch(
    "https://tus-state.internal/internal/init",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to initialize upload in DO: ${response.status}`);
  }
}

async function proxyTusHeadToDo(
  uploadId: string,
  projectId: string,
  requestHeaders: Headers,
  env: Bindings,
): Promise<Response> {
  const headers = new Headers(requestHeaders);
  headers.set("X-Project-Id", projectId);
  headers.set("X-Upload-Id", uploadId);

  let response: Response;
  try {
    response = await getTusUploadStub(uploadId, env).fetch(
      new Request("https://tus-state.internal/internal/head", {
        method: "GET",
        headers,
      }),
    );
  } catch (error) {
    console.error("[tus-proxy] HEAD stub.fetch failed", {
      uploadId,
      projectId,
      sourceStatus: "throw",
      error,
    });
    return new Response(null, {
      status: 503,
      headers: {
        "Tus-Resumable": TUS_VERSION,
        "Retry-After": "2",
        "Cache-Control": "no-store",
      },
    });
  }

  if (response.status === HTTP_STATUS.NOT_FOUND) {
    console.warn("[tus-proxy] HEAD got 404 from DO, converting to 503", {
      uploadId,
      projectId,
      sourceStatus: response.status,
    });
    return new Response(null, {
      status: 503,
      headers: {
        "Tus-Resumable": TUS_VERSION,
        "Retry-After": "2",
        "Cache-Control": "no-store",
      },
    });
  }

  return response;
}

async function proxyTusPatchToDo(
  uploadId: string,
  projectId: string,
  requestHeaders: Headers,
  body: ReadableStream<Uint8Array> | null,
  env: Bindings,
): Promise<Response> {
  const headers = new Headers(requestHeaders);
  headers.set("X-Project-Id", projectId);
  headers.set("X-Upload-Id", uploadId);
  return await getTusUploadStub(uploadId, env).fetch(
    new Request("https://tus-state.internal/internal/patch", {
      method: "PATCH",
      headers,
      body,
      duplex: "half",
    } as RequestInit),
  );
}

async function proxyTusDeleteToDo(
  uploadId: string,
  projectId: string,
  requestHeaders: Headers,
  env: Bindings,
): Promise<Response> {
  const headers = new Headers(requestHeaders);
  headers.set("X-Project-Id", projectId);
  headers.set("X-Upload-Id", uploadId);
  return await getTusUploadStub(uploadId, env).fetch(
    new Request("https://tus-state.internal/internal/delete", {
      method: "DELETE",
      headers,
    }),
  );
}

function parseUploadMetadata(header: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  if (!header) {
    return metadata;
  }

  const pairs = header.split(",");
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) {
      continue;
    }

    const spaceIndex = trimmed.indexOf(" ");
    const key = spaceIndex === -1 ? trimmed : trimmed.substring(0, spaceIndex);
    const value = spaceIndex === -1 ? "" : trimmed.substring(spaceIndex + 1);

    if (!isValidMetadataKey(key)) {
      throw Errors.invalidRequest(
        `Invalid metadata key: "${key}". Keys must be non-empty ASCII without spaces or commas`,
      );
    }

    if (key in metadata) {
      throw Errors.invalidRequest(
        `Duplicate metadata key: "${key}". All keys must be unique`,
      );
    }

    if (value && !isValidBase64(value)) {
      throw Errors.invalidRequest(
        `Invalid metadata value for key "${key}". Values must be Base64 encoded`,
      );
    }

    const decodedValue = value ? sanitizeHeaderValue(atob(value)) : "";
    metadata[key] = decodedValue;
  }

  return metadata;
}
