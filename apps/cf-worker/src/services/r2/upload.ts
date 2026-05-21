import type { Bindings } from "../../types/bindings";
import type { UploadStatePart } from "../../types/upload-state";

export interface UploadChunkParams {
  storageKey: string;
  chunk: ReadableStream<Uint8Array> | ArrayBuffer;
  chunkSize: number;
  offset: number;
  multipartUploadId: string | null;
  isLastChunk: boolean;
  existingPartsCount: number;
  env: Bindings;
}

export interface UploadChunkResult {
  multipartUploadId: string | null;
  part: UploadStatePart | null;
}

const MULTIPART_MIN_PART_SIZE = 5 * 1024 * 1024;

export function shouldUseSinglePut(params: {
  chunkSize: number;
  isLastChunk: boolean;
  offset: number;
}): boolean {
  return (
    params.chunkSize < MULTIPART_MIN_PART_SIZE &&
    params.isLastChunk &&
    params.offset === 0
  );
}

export async function createMultipartUpload(params: {
  storageKey: string;
  env: Bindings;
}): Promise<string> {
  const multipart = await params.env.R2_BUCKET.createMultipartUpload(
    params.storageKey,
  );
  return multipart.uploadId;
}

export async function uploadChunkToR2(
  params: UploadChunkParams,
): Promise<UploadChunkResult> {
  const {
    storageKey,
    chunk,
    chunkSize,
    offset,
    multipartUploadId,
    isLastChunk,
    existingPartsCount,
    env,
  } = params;

  const chunkBody = chunk;

  // use simple put for small single-chunk uploads
  if (shouldUseSinglePut({ chunkSize, isLastChunk, offset })) {
    await env.R2_BUCKET.put(storageKey, chunkBody);
    return { multipartUploadId: null, part: null };
  }

  const uploadId = multipartUploadId;
  if (!uploadId) {
    throw new Error("Multipart upload id is required for multipart chunks");
  }

  // parts are 1-indexed, calculate sequentially from existing parts count
  // (not from offset, because the upload protocol allows variable chunk sizes)
  const partNumber = existingPartsCount + 1;

  const multipart = env.R2_BUCKET.resumeMultipartUpload(storageKey, uploadId);
  const uploadedPart = await multipart.uploadPart(partNumber, chunkBody);

  return {
    multipartUploadId: uploadId,
    part: {
      partNumber,
      etag: uploadedPart.etag,
    },
  };
}

export async function completeMultipartUpload(params: {
  storageKey: string;
  uploadId: string;
  parts: UploadStatePart[];
  env: Bindings;
}): Promise<R2Object> {
  const { storageKey, uploadId, parts, env } = params;

  const multipart = env.R2_BUCKET.resumeMultipartUpload(storageKey, uploadId);

  const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
  const object = await multipart.complete(sortedParts);

  return object;
}

export async function abortMultipartUpload(params: {
  storageKey: string;
  uploadId: string;
  env: Bindings;
}): Promise<void> {
  const { storageKey, uploadId, env } = params;

  const multipart = env.R2_BUCKET.resumeMultipartUpload(storageKey, uploadId);
  await multipart.abort();
}

export async function deleteObject(
  storageKey: string,
  env: Bindings,
): Promise<void> {
  await env.R2_BUCKET.delete(storageKey);
}

export async function getObject(
  storageKey: string,
  env: Bindings,
): Promise<R2ObjectBody | null> {
  return await env.R2_BUCKET.get(storageKey);
}

export async function listObjects(params: {
  prefix: string;
  limit?: number;
  cursor?: string;
  env: Bindings;
}): Promise<R2Objects> {
  const { prefix, limit = 1000, cursor, env } = params;

  return await env.R2_BUCKET.list({
    prefix,
    limit,
    cursor,
  });
}

export async function getObjectMetadata(
  storageKey: string,
  env: Bindings,
): Promise<R2Object | null> {
  return await env.R2_BUCKET.head(storageKey);
}
