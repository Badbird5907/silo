import type { Context } from "hono";

import type { Bindings, Variables } from "../types/bindings";
import type { FileKeyInfo } from "../types/project";
import { verifyDownloadSignature } from "../middleware/auth";
import {
  lookupFileKey,
  reportMissingObject,
  trackDownload,
} from "../services/callback";
import { Errors } from "../utils/errors";

const FILE_KEY_CACHE_TTL = 60; // 1 minute cache for file key lookups

/**
 * Get cached file key info or fetch from origin
 */
async function getCachedFileKey(
  accessKey: string,
  projectId: string,
  env: Bindings,
): Promise<FileKeyInfo> {
  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.internal/file-key/${projectId}/${accessKey}`,
  );

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse.json();
  }

  const fileKey = await lookupFileKey(accessKey, projectId, env);

  // Cache the result
  const response = new Response(JSON.stringify(fileKey), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `max-age=${FILE_KEY_CACHE_TTL}`,
    },
  });
  await cache.put(cacheKey, response);

  return fileKey;
}

/**
 * Parse Range header and return range options for R2
 */
function parseRangeHeader(
  rangeHeader: string,
  fileSize: number,
): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;

  const start = match[1] ? parseInt(match[1], 10) : undefined;
  const end = match[2] ? parseInt(match[2], 10) : undefined;

  if (start !== undefined && end !== undefined) {
    // bytes=0-499
    return { offset: start, length: end - start + 1 };
  } else if (start !== undefined) {
    // bytes=500-
    return { offset: start, length: fileSize - start };
  } else if (end !== undefined) {
    // bytes=-500 (last 500 bytes)
    return { offset: fileSize - end, length: end };
  }

  return null;
}

export async function handleDownload(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  const accessKey = c.req.param("accessKey");
  const projectId = c.get("projectId");

  const signature = c.req.query("sig");
  const expiresAt = c.req.query("expiresAt");

  if (expiresAt) {
    // check key expiry early
    const now = Math.floor(Date.now() / 1000);
    if (parseInt(expiresAt, 10) < now) {
      throw Errors.unauthorized("Signed URL has expired");
    }
  }

  const ifNoneMatch = c.req.header("If-None-Match");
  const rangeHeader = c.req.header("Range");

  const fileKey = await getCachedFileKey(accessKey, projectId, c.env);

  if (fileKey.expiresAt) {
    const expiryDate = new Date(fileKey.expiresAt);
    if (
      !Number.isNaN(expiryDate.getTime()) &&
      expiryDate.getTime() <= Date.now()
    ) {
      throw Errors.fileExpired(accessKey);
    }
  }

  if (!fileKey.isPublic) {
    if (!signature || !expiresAt) {
      throw Errors.unauthorized("Signature required for private files");
    }

    const isValidSignature = await verifyDownloadSignature({
      accessKey,
      signature,
      expiresAt,
      signingSecret: c.env.SIGNING_SECRET,
    });

    if (!isValidSignature) {
      throw Errors.signatureInvalid();
    }
  }

  const etag = fileKey.file.hash ?? `"${fileKey.file.id}"`;
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  const fileName = c.req.query("fileName") ?? fileKey.fileName;
  const fileSize = fileKey.file.size;
  const storageKey = fileKey.file.storageKey;

  let object: R2ObjectBody | null;
  let isPartialContent = false;
  let rangeStart = 0;
  let rangeEnd = fileSize - 1;

  if (rangeHeader) {
    const range = parseRangeHeader(rangeHeader, fileSize);
    if (range) {
      object = await c.env.R2_BUCKET.get(storageKey, {
        range: { offset: range.offset, length: range.length },
      });
      isPartialContent = true;
      rangeStart = range.offset;
      rangeEnd = range.offset + range.length - 1;
    } else {
      object = await c.env.R2_BUCKET.get(storageKey);
    }
  } else {
    object = await c.env.R2_BUCKET.get(storageKey);
  }

  if (!object) {
    c.executionCtx.waitUntil(
      reportMissingObject(
        {
          projectId,
          environmentId: fileKey.environmentId,
          fileKeyId: fileKey.id,
          fileId: fileKey.file.id,
          accessKey: fileKey.accessKey,
          storageKey,
        },
        c.env,
      ),
    );
    throw Errors.fileNotFound(accessKey);
  }

  const headers = new Headers();
  headers.set("Content-Type", fileKey.file.mimeType);
  headers.set("Content-Disposition", `inline; filename="${fileName}"`);
  headers.set("Cache-Control", "public, max-age=31536000");
  headers.set("ETag", etag);
  headers.set("Accept-Ranges", "bytes");

  c.executionCtx.waitUntil(
    trackDownload(
      {
        projectId,
        environmentId: fileKey.environmentId,
        fileId: fileKey.file.id,
        bytes: isPartialContent ? rangeEnd - rangeStart + 1 : fileSize,
      },
      c.env,
    ),
  );

  if (isPartialContent) {
    headers.set("Content-Range", `bytes ${rangeStart}-${rangeEnd}/${fileSize}`);
    headers.set("Content-Length", (rangeEnd - rangeStart + 1).toString());

    return new Response(object.body, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", fileSize.toString());

  return new Response(object.body, {
    status: 200,
    headers,
  });
}
