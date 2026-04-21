import type { Context } from "hono";

import {
  getClientIpFromHeaders,
  normalizeImageFormat,
  normalizeImageQuality,
  normalizeImageWidth,
} from "@silo-storage/shared";

import type { Bindings, Variables } from "../types/bindings";
import { verifyImageSignature } from "../middleware/auth";
import {
  lookupFileKey,
  reportMissingObject,
  trackDownload,
} from "../services/callback";
import { trackDownloadStream } from "../services/download-stream";
import { getCachedFileKey } from "../services/file-key-cache";
import { Errors } from "../utils/errors";

type ImageContext = Context<{ Bindings: Bindings; Variables: Variables }>;

function isImageMimeType(value: string | null | undefined): boolean {
  return typeof value === "string" && value.toLowerCase().startsWith("image/");
}

function resolveOutputFormat(
  requestedFormat: ReturnType<typeof normalizeImageFormat>,
  acceptHeader: string | undefined,
  sourceMimeType: string,
): "avif" | "webp" | "jpeg" | "png" {
  if (requestedFormat !== "auto") {
    return requestedFormat;
  }

  const normalizedAccept = acceptHeader?.toLowerCase() ?? "";
  if (normalizedAccept.includes("image/avif")) {
    return "avif";
  }
  if (normalizedAccept.includes("image/webp")) {
    return "webp";
  }

  const normalizedSourceMimeType = sourceMimeType.toLowerCase();
  if (
    normalizedSourceMimeType === "image/png" ||
    normalizedSourceMimeType === "image/gif" ||
    normalizedSourceMimeType === "image/webp" ||
    normalizedSourceMimeType === "image/avif"
  ) {
    return "png";
  }

  return "jpeg";
}

function resolveImageVisibility(params: {
  isPublic: boolean;
  serveImage: boolean | null | undefined;
  imageDeliveryPolicy: "disabled" | "public_only" | "public_and_private_opt_in";
}): { allowed: boolean; requiresSignature: boolean } {
  if (params.imageDeliveryPolicy === "disabled") {
    return { allowed: false, requiresSignature: false };
  }

  if (params.isPublic) {
    return { allowed: true, requiresSignature: false };
  }

  if (!params.serveImage) {
    return { allowed: false, requiresSignature: false };
  }

  if (params.imageDeliveryPolicy === "public_and_private_opt_in") {
    return { allowed: true, requiresSignature: false };
  }

  return { allowed: true, requiresSignature: true };
}

function buildImageHeaders(input: {
  sourceHeaders: Headers;
  fileName: string;
}): Headers {
  const headers = new Headers(input.sourceHeaders);
  headers.set("Content-Disposition", `inline; filename="${input.fileName}"`);
  headers.set("Cache-Control", "public, max-age=86400, immutable");
  return headers;
}

function buildInternalImageSourceHeaders(env: Bindings): Headers {
  return new Headers({
    Authorization: `Bearer ${env.CALLBACK_SECRET}`,
  });
}

export async function handleImage(c: ImageContext): Promise<Response> {
  const accessKey = c.req.param("accessKey");
  const projectId = c.get("projectId");
  const clientIp = getClientIpFromHeaders(c.req.raw.headers);
  const imageDeliveryPolicy = c.get("imageDeliveryPolicy");
  const preserveImageExif = c.get("preserveImageExif");
  const signature = c.req.query("sig");
  const expiresAt = c.req.query("expiresAt");
  const isSignedUrl = Boolean(signature && expiresAt);

  if (expiresAt) {
    const now = Math.floor(Date.now() / 1000);
    if (parseInt(expiresAt, 10) < now) {
      throw Errors.unauthorized("Signed URL has expired");
    }
  }

  let width: ReturnType<typeof normalizeImageWidth>;
  let quality: ReturnType<typeof normalizeImageQuality>;
  let requestedFormat: ReturnType<typeof normalizeImageFormat>;
  try {
    width = normalizeImageWidth(c.req.query("w"));
    quality = normalizeImageQuality(c.req.query("q"));
    requestedFormat = normalizeImageFormat(
      c.req.query("fmt") ?? c.req.header("format"),
    );
  } catch (error) {
    throw Errors.invalidRequest(
      error instanceof Error ? error.message : "Invalid image transform params",
    );
  }

  const fileKey = await getCachedFileKey(accessKey, projectId, c.env);

  if (
    fileKey.status !== "completed" ||
    !isImageMimeType(fileKey.file.mimeType)
  ) {
    throw Errors.fileNotFound(accessKey);
  }

  if (fileKey.expiresAt) {
    const expiryDate = new Date(fileKey.expiresAt);
    if (
      !Number.isNaN(expiryDate.getTime()) &&
      expiryDate.getTime() <= Date.now()
    ) {
      throw Errors.fileExpired(accessKey);
    }
  }

  const visibility = resolveImageVisibility({
    isPublic: fileKey.isPublic,
    serveImage: fileKey.serveImage,
    imageDeliveryPolicy,
  });

  if (!visibility.allowed) {
    throw Errors.fileNotFound(accessKey);
  }

  if (visibility.requiresSignature) {
    if (!signature || !expiresAt) {
      throw Errors.unauthorized("Signature required for image delivery");
    }

    const isValidSignature = await verifyImageSignature({
      accessKey,
      signature,
      expiresAt,
      width: c.req.query("w"),
      quality,
      format: requestedFormat,
      signingSecret: c.env.SIGNING_SECRET,
    });

    if (!isValidSignature) {
      throw Errors.signatureInvalid();
    }
  }

  const outputFormat = resolveOutputFormat(
    requestedFormat,
    c.req.header("Accept"),
    fileKey.file.mimeType,
  );
  const metadataMode =
    preserveImageExif && outputFormat !== "webp" && outputFormat !== "png"
      ? "keep"
      : "none";

  const sourceUrl = new URL(c.req.url);
  sourceUrl.host = c.env.WORKER_DOMAIN;
  sourceUrl.pathname = `/internal/image-source/${projectId}/${accessKey}`;
  sourceUrl.search = "";

  const sourceResponse = await fetch(sourceUrl.toString(), {
    headers: buildInternalImageSourceHeaders(c.env),
    cf: {
      image: {
        fit: "scale-down",
        ...(width !== undefined ? { width } : {}),
        ...(quality !== undefined ? { quality } : {}),
        format: outputFormat,
        metadata: metadataMode,
        "origin-auth": "share-publicly",
      },
    },
  });

  if (!sourceResponse.ok) {
    if (sourceResponse.status === 404) {
      throw Errors.fileNotFound(accessKey);
    }
    return sourceResponse;
  }

  const trackedStream = trackDownloadStream(
    sourceResponse.body as ReadableStream<Uint8Array> | null,
  );

  c.executionCtx.waitUntil(
    trackedStream.completion.then(({ bytes, completed }) => {
      if (!completed && bytes === 0) {
        return;
      }

      if (!completed) {
        console.warn("[analytics] Image stream interrupted", {
          projectId,
          fileId: fileKey.file.id,
          bytes,
        });
      }

      return trackDownload(
        {
          projectId,
          environmentId: fileKey.environmentId,
          fileId: fileKey.file.id,
          fileKeyId: fileKey.id,
          fileName: fileKey.fileName,
          bytes,
          isSignedUrl,
          clientIp,
          isImageCDN: true,
        },
        c.env,
      );
    }),
  );

  return new Response(trackedStream.body, {
    status: sourceResponse.status,
    headers: buildImageHeaders({
      sourceHeaders: sourceResponse.headers,
      fileName: c.req.query("fileName") ?? fileKey.fileName,
    }),
  });
}
export async function handleInternalImageSource(
  c: ImageContext,
): Promise<Response> {
  const accessKey = c.req.param("accessKey");
  const projectId = c.req.param("projectId");
  const currentFileKey = await lookupFileKey(accessKey, projectId, c.env);

  if (
    currentFileKey.status !== "completed" ||
    !isImageMimeType(currentFileKey.file.mimeType)
  ) {
    throw Errors.fileNotFound(accessKey);
  }

  const object = await c.env.R2_BUCKET.get(currentFileKey.file.storageKey);
  if (!object) {
    c.executionCtx.waitUntil(
      reportMissingObject(
        {
          projectId,
          environmentId: currentFileKey.environmentId,
          fileKeyId: currentFileKey.id,
          fileId: currentFileKey.file.id,
          accessKey: currentFileKey.accessKey,
          storageKey: currentFileKey.file.storageKey,
        },
        c.env,
      ),
    );
    throw Errors.fileNotFound(accessKey);
  }

  const headers = new Headers();
  headers.set("Content-Type", currentFileKey.file.mimeType);
  headers.set("Cache-Control", "public, max-age=86400");
  if (currentFileKey.file.hash) {
    headers.set("ETag", currentFileKey.file.hash);
  }
  headers.set("Content-Length", currentFileKey.file.size.toString());

  return new Response(object.body, {
    status: 200,
    headers,
  });
}
