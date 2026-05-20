import type { Context } from "hono";

import { getClientIpFromHeaders } from "@silo-storage/shared";

import type { Bindings, Variables } from "../types/bindings";
import type { UploadStateMetadata } from "../types/upload-state";
import {
  detectProjectRouteModeFromPath,
  toProjectScopedPath,
} from "../lib/subdomain";
import {
  registerUploadSession,
  verifyUploadSignature,
} from "../services/callback";
import { generateExpirationDate } from "../services/upload-state/metadata";
import { parseContentRangeHeader } from "../services/upload/range";
import {
  CONTENT_TYPE_OCTET_STREAM,
  HTTP_STATUS,
  UPLOAD_LENGTH_HEADER,
  UPLOAD_OFFSET_HEADER,
  UPLOAD_PROTOCOL_VERSION,
} from "../utils/constants";
import { Errors, UploadError } from "../utils/errors";
import { parseNonNegativeInt } from "../utils/validation";

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

function assertProjectUploadWritable(c: AppContext): void {
  if (c.get("projectLifecycleState") === "deleting") {
    throw new UploadError(
      "INVALID_REQUEST",
      409,
      "Project is currently being deleted and cannot accept upload writes.",
    );
  }
}

function getUploadStub(uploadId: string, env: Bindings): DurableObjectStub {
  const id = env.UPLOAD_STATE_DO.idFromName(uploadId);
  return env.UPLOAD_STATE_DO.get(id);
}

async function initializeUploadInDo(
  uploadId: string,
  metadata: UploadStateMetadata,
  env: Bindings,
): Promise<void> {
  const response = await getUploadStub(uploadId, env).fetch(
    "https://upload-state.internal/internal/init",
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

function buildSignaturePayload(c: AppContext) {
  const environmentId = c.req.query("environmentId");
  const fileKeyId = c.req.query("fileKeyId");
  const accessKey = c.req.query("accessKey");
  const fileName = c.req.query("fileName");
  const keyId = c.req.query("keyId");
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

  return {
    environmentId,
    fileKeyId,
    accessKey,
    fileName,
    keyId,
    signature,
    sizeParam,
  };
}

export async function handleUploadCreate(c: AppContext): Promise<Response> {
  assertProjectUploadWritable(c);

  const projectId: string = c.get("projectId");
  const payload = buildSignaturePayload(c);

  const verificationResult = await verifyUploadSignature(
    {
      keyId: payload.keyId,
      signature: payload.signature,
      payload: {
        type: "upload",
        environmentId: payload.environmentId,
        fileKeyId: payload.fileKeyId,
        accessKey: payload.accessKey,
        fileName: payload.fileName,
        size: payload.sizeParam,
        keyId: payload.keyId,
        ...(c.req.query("hash") && { hash: c.req.query("hash") ?? undefined }),
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
        uploadMethod: "resumable",
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

  const size = verificationResult.size;
  if (size === undefined) {
    throw Errors.invalidRequest("Signed upload URL is missing a file size");
  }
  const maxSize = Number.parseInt(c.env.UPLOAD_MAX_SIZE, 10);
  if (!Number.isFinite(maxSize) || maxSize <= 0) {
    throw new Error(
      `Server configuration error: UPLOAD_MAX_SIZE is not a valid positive integer (got: ${c.env.UPLOAD_MAX_SIZE})`,
    );
  }
  if (size > maxSize) {
    throw Errors.uploadTooLarge(size, maxSize);
  }

  const uploadId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const storageKey = `${projectId}/${payload.environmentId}/${crypto.randomUUID()}`;
  const clientIp = getClientIpFromHeaders(c.req.raw.headers);
  const metadata: UploadStateMetadata = {
    uploadId,
    projectId,
    environmentId: payload.environmentId,
    fileKeyId: payload.fileKeyId,
    accessKey: payload.accessKey,
    fileName: payload.fileName,
    size,
    offset: 0,
    storageKey,
    multipartUploadId: null,
    parts: [],
    isPublic: verificationResult.isPublic ?? false,
    claimedHash: verificationResult.claimedHash ?? undefined,
    claimedMimeType: verificationResult.claimedMimeType ?? undefined,
    acceptedMimeTypes: verificationResult.acceptedMimeTypes ?? undefined,
    claimedSize: size,
    createdAt: new Date().toISOString(),
    expiresAt: generateExpirationDate(c.env),
    clientIp,
    metadata: {},
    rawMetadata: "",
    callbackDeliveredAt: null,
  };

  await initializeUploadInDo(uploadId, metadata, c.env);
  try {
    await registerUploadSession(
      {
        projectId,
        environmentId: payload.environmentId,
        fileKeyId: payload.fileKeyId,
        uploadId,
        storageKey,
      },
      c.env,
    );
  } catch (error) {
    const headers = new Headers();
    headers.set("X-Silo-Upload-Version", UPLOAD_PROTOCOL_VERSION);
    await getUploadStub(uploadId, c.env)
      .fetch("https://upload-state.internal/internal/delete", {
        method: "DELETE",
        headers: {
          "X-Silo-Upload-Version": UPLOAD_PROTOCOL_VERSION,
          "X-Project-Id": projectId,
          "X-Upload-Id": uploadId,
        },
      })
      .catch(() => undefined);
    throw error;
  }

  const url = new URL(c.req.url);
  const projectSlug = c.get("projectSlug");
  if (!projectSlug) throw Errors.projectNotFound("missing-project-scope");
  const routeMode = detectProjectRouteModeFromPath(url.pathname, projectSlug);
  const uploadLocationPath = toProjectScopedPath(
    `/ingest/resumable/${uploadId}`,
    projectSlug,
    routeMode,
  );

  return c.json(
    {
      ok: true,
      uploadId,
      offset: 0,
      size,
      uploadUrl: `${url.protocol}//${url.host}${uploadLocationPath}${url.search}`,
      expiresAt: metadata.expiresAt,
    },
    HTTP_STATUS.CREATED,
  );
}

export async function handleUploadStatus(c: AppContext): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  const projectId: string = c.get("projectId");
  const response = await getUploadStub(uploadId, c.env).fetch(
    "https://upload-state.internal/internal/head",
    {
      method: "GET",
      headers: {
        "X-Silo-Upload-Version": UPLOAD_PROTOCOL_VERSION,
        "X-Project-Id": projectId,
        "X-Upload-Id": uploadId,
      },
    },
  );
  if (!response.ok) return response;

  const rawOffset = response.headers.get(UPLOAD_OFFSET_HEADER);
  const parsedOffset = rawOffset == null ? 0 : Number(rawOffset);
  if (!Number.isFinite(parsedOffset)) {
    throw new Error(
      `Invalid ${UPLOAD_OFFSET_HEADER} header from storage: ${rawOffset}`,
    );
  }

  const rawSize = response.headers.get(UPLOAD_LENGTH_HEADER);
  const parsedSize = rawSize == null ? null : Number(rawSize);
  if (rawSize != null && !Number.isFinite(parsedSize)) {
    throw new Error(
      `Invalid ${UPLOAD_LENGTH_HEADER} header from storage: ${rawSize}`,
    );
  }

  return c.json({
    ok: true,
    uploadId,
    offset: parsedOffset,
    size: parsedSize,
  });
}

export async function handleUploadPut(c: AppContext): Promise<Response> {
  assertProjectUploadWritable(c);

  const uploadId = c.req.param("uploadId");
  const projectId: string = c.get("projectId");
  const range = parseContentRangeHeader(c.req.header("Content-Range"));
  const contentLength = parseNonNegativeInt(c.req.header("Content-Length"));
  if (contentLength === null) {
    throw Errors.invalidRequest("Content-Length header is required");
  }
  if (contentLength !== range.length) {
    throw Errors.invalidRequest(
      `Content-Length ${contentLength} does not match Content-Range length ${range.length}`,
    );
  }

  const body = c.req.raw.body as ReadableStream<Uint8Array> | null;
  if (!body) throw Errors.invalidRequest("Request body is required");

  return await getUploadStub(uploadId, c.env).fetch(
    "https://upload-state.internal/internal/patch",
    {
      method: "PATCH",
      headers: {
        "X-Silo-Upload-Version": UPLOAD_PROTOCOL_VERSION,
        "X-Silo-Upload-Request": "1",
        "X-Project-Id": projectId,
        "X-Upload-Id": uploadId,
        "Content-Type": CONTENT_TYPE_OCTET_STREAM,
        "Content-Length": String(contentLength),
        "Upload-Offset": String(range.start),
        "Upload-Length": String(range.total),
      },
      body,
      duplex: "half",
    } as RequestInit,
  );
}

export async function handleUploadDelete(c: AppContext): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  const projectId: string = c.get("projectId");
  const response = await getUploadStub(uploadId, c.env).fetch(
    "https://upload-state.internal/internal/delete",
    {
      method: "DELETE",
      headers: {
        "X-Silo-Upload-Version": UPLOAD_PROTOCOL_VERSION,
        "X-Project-Id": projectId,
        "X-Upload-Id": uploadId,
      },
    },
  );
  if (!response.ok) return response;
  return c.json({ ok: true });
}
