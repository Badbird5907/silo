import type { Bindings } from "../types/bindings";
import type { UploadCallbackResponse } from "../types/project";
import type { TusUploadMetadata } from "../types/tus";
import {
  areMimeTypesEquivalent,
  detectMimeType,
  isAllowedMimeType,
} from "../lib/file-types";
import { readHeaderBytes } from "../lib/hash";
import {
  registerMultipartUploadSession,
  sendUploadCallback,
} from "../services/callback";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  shouldUseSinglePut,
  uploadChunkToR2,
} from "../services/r2/upload";
import { isUploadExpired } from "../services/tus/metadata";
import { isRetryableError, retry } from "../services/tus/retry";
import {
  CONTENT_TYPE_OCTET_STREAM,
  HTTP_STATUS,
  TUS_VERSION,
  UPLOAD_DEFER_LENGTH_HEADER,
  UPLOAD_EXPIRES_HEADER,
  UPLOAD_LENGTH_HEADER,
  UPLOAD_METADATA_HEADER,
  UPLOAD_OFFSET_HEADER,
} from "../utils/constants";
import { createErrorResponse, Errors, TusError } from "../utils/errors";
import { parseNonNegativeInt, sanitizeHeaderValue } from "../utils/validation";

const METADATA_KEY = "upload:metadata";
const MULTIPART_RECOVERY_KEY = "upload:multipart-recovery";
const DEFAULT_MAX_PATCH_SIZE = 256 * 1024 * 1024;

interface MultipartRecoveryState {
  uploadId: string;
  projectId: string;
  environmentId: string;
  fileKeyId: string;
  storageKey: string;
  multipartUploadId: string;
  createdAt: string;
}

function getMaxPatchSizeBytes(env: Bindings): number {
  const raw = env.TUS_MAX_PATCH_SIZE.trim();
  if (!raw) {
    return DEFAULT_MAX_PATCH_SIZE;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid TUS_MAX_PATCH_SIZE value: ${raw}`);
  }

  return parsed;
}

function isTerminalSessionRegistrationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("not pending") ||
    message.includes("session mismatch") ||
    message.includes("already registered") ||
    message.includes("(409)")
  );
}

function isNoSuchUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("nosuchupload") ||
    message.includes("no such upload") ||
    message.includes("upload does not exist")
  );
}

export class TusStateDO {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Bindings,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case "/internal/init":
          if (request.method === "POST") {
            return await this.inLock(() => this.handleInit(request));
          }
          break;
        case "/internal/head":
          if (request.method === "GET" || request.method === "HEAD") {
            return await this.handleHead(request);
          }
          break;
        case "/internal/patch":
          if (request.method === "PATCH") {
            return await this.inLock(() => this.handlePatch(request));
          }
          break;
        case "/internal/delete":
          if (request.method === "DELETE") {
            return await this.inLock(() => this.handleDelete(request));
          }
          break;
      }

      return new Response("Not found", { status: HTTP_STATUS.NOT_FOUND });
    } catch (error) {
      const response = createErrorResponse(error as TusError | Error);
      const headers = new Headers(response.headers);
      if (url.pathname === "/internal/head") {
        headers.set("Cache-Control", "no-store");
      }
      return new Response(response.body, { status: response.status, headers });
    }
  }

  private assertTusVersion(request: Request): void {
    const tusResumable = request.headers.get("Tus-Resumable");
    if (tusResumable !== TUS_VERSION) {
      throw Errors.invalidTusVersion(TUS_VERSION, tusResumable ?? undefined);
    }
  }

  private async inLock(fn: () => Promise<Response>): Promise<Response> {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.queue;
    this.queue = previous.then(() => waiting);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    const body: { metadata?: TusUploadMetadata } = await request.json();
    if (!body.metadata) {
      throw Errors.invalidRequest("Missing metadata payload");
    }
    await this.persistMetadata(body.metadata);
    this.logEvent("upload_initialized", body.metadata, {
      mode: "do",
      offsetAfter: body.metadata.offset,
      multipartUploadId: body.metadata.multipartUploadId,
    });
    return new Response(null, { status: HTTP_STATUS.NO_CONTENT });
  }

  private async handleHead(request: Request): Promise<Response> {
    this.assertTusVersion(request);

    const metadata = await this.requireUpload(
      request.headers.get("X-Project-Id"),
      request.headers.get("X-Upload-Id"),
      true,
    );
    if (metadata.size !== null && metadata.offset >= metadata.size) {
      await this.tryDeliverCompletionCallback(metadata);
    }

    const headers: Record<string, string> = {
      "Tus-Resumable": TUS_VERSION,
      [UPLOAD_OFFSET_HEADER]: metadata.offset.toString(),
      [UPLOAD_EXPIRES_HEADER]: metadata.expiresAt,
      "Cache-Control": "no-store",
    };

    if (metadata.size !== null) {
      headers[UPLOAD_LENGTH_HEADER] = metadata.size.toString();
    } else {
      headers[UPLOAD_DEFER_LENGTH_HEADER] = "1";
    }

    if (metadata.rawMetadata) {
      headers[UPLOAD_METADATA_HEADER] = metadata.rawMetadata;
    } else if (Object.keys(metadata.metadata).length > 0) {
      headers[UPLOAD_METADATA_HEADER] = Object.entries(metadata.metadata)
        .map(([key, value]) => {
          const sanitizedValue = sanitizeHeaderValue(value);
          return sanitizedValue ? `${key} ${btoa(sanitizedValue)}` : key;
        })
        .join(",");
    }

    return new Response(null, { status: HTTP_STATUS.OK, headers });
  }

  private async handlePatch(request: Request): Promise<Response> {
    this.assertTusVersion(request);

    const contentType = request.headers.get("Content-Type");
    if (contentType !== CONTENT_TYPE_OCTET_STREAM) {
      throw Errors.invalidContentType(
        CONTENT_TYPE_OCTET_STREAM,
        contentType ?? undefined,
      );
    }

    const metadata = await this.requireUpload(
      request.headers.get("X-Project-Id"),
      request.headers.get("X-Upload-Id"),
      false,
    );
    const uploadOffsetHeader = request.headers.get(UPLOAD_OFFSET_HEADER);
    if (!uploadOffsetHeader) {
      throw Errors.invalidRequest("Upload-Offset header is required");
    }

    const uploadOffset = parseNonNegativeInt(uploadOffsetHeader);
    if (uploadOffset === null) {
      throw Errors.invalidRequest(
        "Upload-Offset must be a non-negative integer",
      );
    }
    if (uploadOffset !== metadata.offset) {
      throw Errors.offsetMismatch(metadata.offset, uploadOffset);
    }

    const uploadLengthHeader = request.headers.get(UPLOAD_LENGTH_HEADER);
    if (metadata.size === null && uploadLengthHeader) {
      const uploadLength = parseNonNegativeInt(uploadLengthHeader);
      if (uploadLength === null) {
        throw Errors.invalidRequest(
          "Upload-Length must be a non-negative integer",
        );
      }
      if (
        metadata.claimedSize !== undefined &&
        uploadLength !== metadata.claimedSize
      ) {
        throw Errors.sizeMismatch(metadata.claimedSize, uploadLength);
      }
      if (uploadLength < metadata.offset) {
        throw Errors.invalidRequest(
          `Upload-Length ${uploadLength} is less than current offset ${metadata.offset}`,
        );
      }
      const maxSize = parseInt(this.env.TUS_MAX_SIZE, 10);
      if (uploadLength > maxSize) {
        console.error("Upload too large", { uploadLength, maxSize });
        throw Errors.uploadTooLarge(uploadLength, maxSize);
      }
      metadata.size = uploadLength;
      await this.persistMetadata(metadata);
    } else if (uploadLengthHeader && metadata.size !== null) {
      const newLength = parseNonNegativeInt(uploadLengthHeader);
      if (newLength !== metadata.size) {
        throw Errors.invalidRequest("Upload-Length cannot be changed once set");
      }
    }

    const contentLength = parseNonNegativeInt(
      request.headers.get("Content-Length") ?? undefined,
    );
    if (contentLength === null) {
      throw Errors.invalidRequest("Content-Length header is required");
    }
    if (
      metadata.size !== null &&
      uploadOffset + contentLength > metadata.size
    ) {
      throw Errors.invalidRequest(
        `Content-Length would exceed Upload-Length: ${uploadOffset} + ${contentLength} > ${metadata.size}`,
      );
    }

    const maxPatchSize = getMaxPatchSizeBytes(this.env);
    if (contentLength > maxPatchSize) {
      console.error("Upload too large", { contentLength, maxPatchSize });
      throw Errors.uploadTooLarge(contentLength, maxPatchSize);
    }

    if (contentLength === 0) {
      if (metadata.size !== null && metadata.offset >= metadata.size) {
        await this.tryDeliverCompletionCallback(metadata);
      }
      return new Response(null, {
        status: HTTP_STATUS.NO_CONTENT,
        headers: {
          "Tus-Resumable": TUS_VERSION,
          [UPLOAD_OFFSET_HEADER]: metadata.offset.toString(),
          [UPLOAD_EXPIRES_HEADER]: metadata.expiresAt,
        },
      });
    }

    const body = request.body as ReadableStream<Uint8Array> | null;
    if (!body) {
      throw Errors.invalidRequest("Request body is required");
    }

    const newOffset = metadata.offset + contentLength;
    const isComplete = metadata.size !== null && newOffset >= metadata.size;
    const nextPartNumber = metadata.parts.length + 1;
    const usesSinglePut = shouldUseSinglePut({
      chunkSize: contentLength,
      isLastChunk: isComplete,
      offset: metadata.offset,
    });

    if (!usesSinglePut && !metadata.multipartUploadId) {
      const createdUploadId = await createMultipartUpload({
        storageKey: metadata.storageKey,
        env: this.env,
      });
      const recoveryState: MultipartRecoveryState = {
        uploadId: metadata.uploadId,
        projectId: metadata.projectId,
        environmentId: metadata.environmentId,
        fileKeyId: metadata.fileKeyId,
        storageKey: metadata.storageKey,
        multipartUploadId: createdUploadId,
        createdAt: new Date().toISOString(),
      };

      try {
        await this.persistMultipartRecovery(recoveryState);
      } catch (recoveryPersistError) {
        console.error("Failed to persist multipart recovery state", {
          uploadId: metadata.uploadId,
          multipartUploadId: createdUploadId,
          recoveryPersistError,
        });

        await retry(
          () =>
            abortMultipartUpload({
              storageKey: metadata.storageKey,
              uploadId: createdUploadId,
              env: this.env,
            }),
          {
            maxAttempts: 3,
            baseDelayMs: 150,
            maxDelayMs: 1000,
          },
        ).catch((abortError: unknown) => {
          console.error(
            "Failed to abort multipart upload after recovery failure",
            {
              uploadId: metadata.uploadId,
              multipartUploadId: createdUploadId,
              abortError,
            },
          );
        });

        throw new TusError(
          "INVALID_REQUEST",
          503,
          "Upload setup temporarily unavailable. Retry shortly.",
        );
      }

      metadata.multipartUploadId = createdUploadId;
      try {
        await this.persistMetadata(metadata);
        await retry(
          () =>
            registerMultipartUploadSession(
              {
                projectId: metadata.projectId,
                environmentId: metadata.environmentId,
                fileKeyId: metadata.fileKeyId,
                uploadId: metadata.uploadId,
                multipartUploadId: createdUploadId,
              },
              this.env,
            ),
          {
            maxAttempts: 3,
            baseDelayMs: 150,
            maxDelayMs: 1000,
          },
        );
        await this.deleteMultipartRecovery().catch(
          (deleteRecoveryError: unknown) => {
            console.error("Failed to clear multipart recovery state", {
              uploadId: metadata.uploadId,
              multipartUploadId: createdUploadId,
              deleteRecoveryError,
            });
          },
        );
      } catch (persistError) {
        let abortFailed = false;

        try {
          await retry(
            () =>
              abortMultipartUpload({
                storageKey: metadata.storageKey,
                uploadId: createdUploadId,
                env: this.env,
              }),
            {
              maxAttempts: 3,
              baseDelayMs: 150,
              maxDelayMs: 1000,
            },
          );
        } catch (abortError) {
          abortFailed = true;
          metadata.multipartUploadId = createdUploadId;
          console.error(
            "Failed to abort multipart upload after persist failure",
            {
              uploadId: metadata.uploadId,
              multipartUploadId: createdUploadId,
              abortError,
            },
          );

          await this.persistMetadata(metadata).catch(
            (metadataPersistError: unknown) => {
              console.error(
                "Failed to persist upload metadata after multipart cleanup failure",
                {
                  uploadId: metadata.uploadId,
                  metadataPersistError,
                },
              );
            },
          );
          await this.persistMultipartRecovery(recoveryState).catch(
            (recoveryPersistError: unknown) => {
              console.error(
                "Failed to persist multipart recovery after cleanup failure",
                {
                  uploadId: metadata.uploadId,
                  multipartUploadId: createdUploadId,
                  recoveryPersistError,
                },
              );
            },
          );
        }

        if (abortFailed) {
          throw new TusError(
            "INVALID_REQUEST",
            503,
            "Upload cleanup temporarily unavailable. Retry shortly.",
          );
        }

        await this.deleteMultipartRecovery().catch(
          (deleteRecoveryError: unknown) => {
            console.error("Failed to clear multipart recovery state", {
              uploadId: metadata.uploadId,
              multipartUploadId: createdUploadId,
              deleteRecoveryError,
            });
          },
        );

        await this.deleteMetadata().catch((deleteMetadataError: unknown) => {
          console.error("Failed to clear upload metadata after setup failure", {
            uploadId: metadata.uploadId,
            deleteMetadataError,
          });
        });

        if (isTerminalSessionRegistrationError(persistError)) {
          throw new TusError(
            "INVALID_REQUEST",
            409,
            "Upload session is no longer pending",
          );
        }

        throw persistError;
      }
    }

    this.logEvent("patch_start", metadata, {
      mode: "do",
      offsetBefore: metadata.offset,
      offsetAfter: newOffset,
      contentLength,
      multipartUploadId: metadata.multipartUploadId,
      partNumber: nextPartNumber,
    });

    let uploadResult;
    try {
      uploadResult = await uploadChunkToR2({
        storageKey: metadata.storageKey,
        chunk: body,
        chunkSize: contentLength,
        offset: metadata.offset,
        multipartUploadId: metadata.multipartUploadId,
        isLastChunk: isComplete,
        existingPartsCount: metadata.parts.length,
        env: this.env,
      });
    } catch (error) {
      // Drain/cancel remaining request body to prevent uncaught stream errors
      // that crash the DO instance in miniflare/wrangler dev.
      try {
        await body.cancel();
      } catch {
        /* already closed or locked */
      }

      if (isRetryableError(error)) {
        this.logEvent("patch_retryable_failure", metadata, {
          mode: "do",
          offsetBefore: metadata.offset,
          multipartUploadId: metadata.multipartUploadId,
          partNumber: nextPartNumber,
          errorName: error instanceof Error ? error.name : typeof error,
          error: error instanceof Error ? error.message : String(error),
        });
        return new Response(
          JSON.stringify({
            error:
              "Temporary upload failure. Retry PATCH with same Upload-Offset.",
            code: "temporary_unavailable",
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "Tus-Resumable": TUS_VERSION,
              "Retry-After": "1",
              [UPLOAD_OFFSET_HEADER]: metadata.offset.toString(),
              [UPLOAD_EXPIRES_HEADER]: metadata.expiresAt,
            },
          },
        );
      }
      throw error;
    }

    metadata.offset = newOffset;
    if (uploadResult.multipartUploadId) {
      metadata.multipartUploadId = uploadResult.multipartUploadId;
    }
    if (uploadResult.part) {
      metadata.parts.push(uploadResult.part);
    }
    this.logEvent("patch_committed", metadata, {
      mode: "do",
      offsetBefore: uploadOffset,
      offsetAfter: metadata.offset,
      multipartUploadId: metadata.multipartUploadId,
      partNumber: uploadResult.part?.partNumber ?? null,
    });

    let completion: UploadCallbackResponse | null = null;
    if (isComplete) {
      completion = await this.finalizeUpload(metadata);
    } else {
      await this.persistMetadata(metadata);
    }

    if (request.headers.get("X-Silo-Resumable") === "1") {
      return new Response(
        JSON.stringify({
          ok: true,
          uploadId: metadata.uploadId,
          offset: metadata.offset,
          size: metadata.size,
          complete: isComplete,
          completion,
          onUploadCompleteResult: completion?.onUploadCompleteResult,
        }),
        {
          status: HTTP_STATUS.OK,
          headers: {
            "Content-Type": "application/json",
            [UPLOAD_OFFSET_HEADER]: metadata.offset.toString(),
            [UPLOAD_EXPIRES_HEADER]: metadata.expiresAt,
          },
        },
      );
    }

    return new Response(null, {
      status: HTTP_STATUS.NO_CONTENT,
      headers: {
        "Tus-Resumable": TUS_VERSION,
        [UPLOAD_OFFSET_HEADER]: metadata.offset.toString(),
        [UPLOAD_EXPIRES_HEADER]: metadata.expiresAt,
      },
    });
  }

  private async handleDelete(request: Request): Promise<Response> {
    this.assertTusVersion(request);

    const projectId = request.headers.get("X-Project-Id");
    const uploadIdHeader = request.headers.get("X-Upload-Id");
    const metadata = await this.getMetadata();
    const recovery = metadata ? null : await this.getMultipartRecovery();

    if (!metadata && !recovery) {
      throw Errors.uploadNotFound(uploadIdHeader ?? "unknown");
    }

    if (
      uploadIdHeader &&
      ((metadata && metadata.uploadId !== uploadIdHeader) ||
        (recovery && recovery.uploadId !== uploadIdHeader))
    ) {
      throw Errors.uploadNotFound(uploadIdHeader);
    }

    const effectiveProjectId = metadata?.projectId ?? recovery?.projectId;
    if (!effectiveProjectId) {
      throw Errors.uploadNotFound(uploadIdHeader ?? "unknown");
    }
    if (projectId && effectiveProjectId !== projectId) {
      throw Errors.unauthorized("Upload does not belong to this project");
    }

    const effectiveUploadId =
      metadata?.uploadId ?? recovery?.uploadId ?? "unknown";
    const effectiveEnvironmentId =
      metadata?.environmentId ?? recovery?.environmentId;
    const effectiveFileKeyId = metadata?.fileKeyId ?? recovery?.fileKeyId;
    const effectiveStorageKey =
      metadata?.storageKey ?? recovery?.storageKey ?? "";
    const multipartUploadId =
      metadata?.multipartUploadId ?? recovery?.multipartUploadId ?? null;

    let cleanupFailed = false;

    if (multipartUploadId) {
      try {
        await retry((attempt) => {
          if (attempt > 1) {
            this.logEvent(
              "delete_retry_abort_multipart",
              {
                uploadId: effectiveUploadId,
                projectId: effectiveProjectId,
              },
              {
                mode: "do",
                retryAttempt: attempt,
                multipartUploadId,
              },
            );
          }
          return abortMultipartUpload({
            storageKey: effectiveStorageKey,
            uploadId: multipartUploadId,
            env: this.env,
          });
        });
      } catch (error) {
        if (!isNoSuchUploadError(error)) {
          cleanupFailed = true;
          console.error("Failed to abort multipart upload", error);
        }
      }
    }

    try {
      await this.env.R2_BUCKET.delete(effectiveStorageKey);
    } catch (error) {
      cleanupFailed = true;
      console.error("Failed to delete upload object", error);
    }

    if (cleanupFailed) {
      throw new TusError(
        "INVALID_REQUEST",
        503,
        "Upload cleanup temporarily unavailable. Retry deletion shortly.",
      );
    }

    await this.deleteMetadata();

    await sendUploadCallback(
      {
        contractVersion: 1,
        clientIp: metadata?.clientIp ?? null,
        type: "upload-failed",
        data: {
          environmentId: effectiveEnvironmentId ?? "unknown",
          fileKeyId: effectiveFileKeyId ?? "unknown",
          projectId: effectiveProjectId,
          error: "Upload aborted via TUS termination",
        },
      },
      this.env,
    ).catch((error) => {
      console.error("Failed to send upload failure callback", error);
    });
    this.logEvent(
      "upload_deleted",
      {
        uploadId: effectiveUploadId,
        projectId: effectiveProjectId,
      },
      {
        mode: "do",
        offsetAfter: metadata?.offset ?? 0,
        multipartUploadId,
      },
    );

    return new Response(null, {
      status: HTTP_STATUS.NO_CONTENT,
      headers: { "Tus-Resumable": TUS_VERSION },
    });
  }

  private async requireUpload(
    projectId: string | null,
    uploadIdHeader: string | null,
    treatMissingAsTemporary = false,
  ): Promise<TusUploadMetadata> {
    const metadata = await this.getMetadata();
    if (!metadata) {
      if (treatMissingAsTemporary) {
        this.logMissingState({
          mode: "do",
          uploadIdHeader,
          projectIdHeader: projectId,
        });
        throw new TusError(
          "INVALID_REQUEST",
          503,
          "Upload state temporarily unavailable. Retry shortly.",
        );
      }
      throw Errors.uploadNotFound(uploadIdHeader ?? "unknown");
    }
    if (projectId && metadata.projectId !== projectId) {
      throw Errors.unauthorized("Upload does not belong to this project");
    }
    if (isUploadExpired(metadata)) {
      await this.cleanupExpiredUpload(metadata);
      throw Errors.uploadExpired(metadata.uploadId);
    }
    return metadata;
  }

  private async cleanupExpiredUpload(
    metadata: TusUploadMetadata,
  ): Promise<void> {
    const multipartUploadId = metadata.multipartUploadId;
    let cleanupFailed = false;

    if (multipartUploadId) {
      try {
        await abortMultipartUpload({
          storageKey: metadata.storageKey,
          uploadId: multipartUploadId,
          env: this.env,
        });
      } catch (error) {
        if (!isNoSuchUploadError(error)) {
          cleanupFailed = true;
          console.error("Failed to abort multipart upload for expired upload", {
            uploadId: metadata.uploadId,
            multipartUploadId,
            error,
          });
        }
      }
    }

    try {
      await this.env.R2_BUCKET.delete(metadata.storageKey);
    } catch (error) {
      cleanupFailed = true;
      console.error("Failed to delete expired upload object", {
        uploadId: metadata.uploadId,
        storageKey: metadata.storageKey,
        error,
      });
    }

    if (cleanupFailed) {
      throw new TusError(
        "INVALID_REQUEST",
        503,
        "Expired upload cleanup temporarily unavailable. Retry shortly.",
      );
    }

    await this.deleteMetadata().catch((error: unknown) => {
      console.error("Failed to delete metadata for expired upload", {
        uploadId: metadata.uploadId,
        error,
      });
    });
  }

  private logMissingState(extra: Record<string, unknown> = {}): void {
    console.info("[tus-do]", {
      event: "upload_state_missing",
      ...extra,
    });
  }

  private async finalizeUpload(
    metadata: TusUploadMetadata,
  ): Promise<UploadCallbackResponse | null> {
    const multipartUploadId = metadata.multipartUploadId;
    if (multipartUploadId && metadata.parts.length > 0) {
      await retry((attempt) => {
        if (attempt > 1) {
          this.logEvent("finalize_retry_complete_multipart", metadata, {
            mode: "do",
            retryAttempt: attempt,
            multipartUploadId: metadata.multipartUploadId,
          });
        }
        return completeMultipartUpload({
          storageKey: metadata.storageKey,
          uploadId: multipartUploadId,
          parts: metadata.parts,
          env: this.env,
        });
      });
    }

    const fileObject = await this.env.R2_BUCKET.get(metadata.storageKey);
    if (!fileObject) {
      await this.deleteMetadata().catch((deleteMetadataError: unknown) => {
        console.error("Failed to clear metadata after missing file object", {
          uploadId: metadata.uploadId,
          deleteMetadataError,
        });
      });

      await sendUploadCallback(
        {
          contractVersion: 1,
          clientIp: metadata.clientIp ?? null,
          type: "upload-failed",
          data: {
            environmentId: metadata.environmentId,
            fileKeyId: metadata.fileKeyId,
            projectId: metadata.projectId,
            error: "Uploaded object is missing at finalize time",
          },
        },
        this.env,
      ).catch((callbackError: unknown) => {
        console.error("Failed to send upload failure callback", {
          uploadId: metadata.uploadId,
          callbackError,
        });
      });

      throw new Error("Failed to retrieve uploaded file");
    }

    const actualSize = fileObject.size;

    if (
      metadata.claimedSize !== undefined &&
      actualSize !== metadata.claimedSize
    ) {
      await this.env.R2_BUCKET.delete(metadata.storageKey);
      await this.deleteMetadata();
      await sendUploadCallback(
        {
          contractVersion: 1,
          clientIp: metadata.clientIp ?? null,
          type: "upload-failed",
          data: {
            environmentId: metadata.environmentId,
            fileKeyId: metadata.fileKeyId,
            projectId: metadata.projectId,
            error: "Uploaded object size does not match claimed size",
          },
        },
        this.env,
      ).catch((callbackError: unknown) => {
        console.error("Failed to send upload failure callback", {
          uploadId: metadata.uploadId,
          callbackError,
        });
      });

      throw Errors.sizeMismatch(metadata.claimedSize, actualSize);
    }

    const headerBytes = await readHeaderBytes(
      fileObject.body as ReadableStream<Uint8Array>,
      8192,
    );
    const actualMimeType = await detectMimeType(headerBytes, metadata.fileName);
    const actualHash = metadata.claimedHash ?? null;

    if (
      metadata.claimedMimeType &&
      actualMimeType !== "application/octet-stream" &&
      !areMimeTypesEquivalent(
        metadata.claimedMimeType,
        actualMimeType,
        metadata.fileName,
      )
    ) {
      await this.env.R2_BUCKET.delete(metadata.storageKey);
      await this.deleteMetadata();
      await sendUploadCallback(
        {
          contractVersion: 1,
          clientIp: metadata.clientIp ?? null,
          type: "upload-failed",
          data: {
            environmentId: metadata.environmentId,
            fileKeyId: metadata.fileKeyId,
            projectId: metadata.projectId,
            error: "Detected MIME type does not match claimed MIME type",
          },
        },
        this.env,
      ).catch((callbackError: unknown) => {
        console.error("Failed to send upload failure callback", {
          uploadId: metadata.uploadId,
          callbackError,
        });
      });
      throw Errors.mimeTypeMismatch(metadata.claimedMimeType, actualMimeType);
    }

    if (
      metadata.acceptedMimeTypes &&
      metadata.acceptedMimeTypes.length > 0 &&
      !isAllowedMimeType(
        actualMimeType,
        metadata.acceptedMimeTypes,
        metadata.fileName,
      )
    ) {
      await this.env.R2_BUCKET.delete(metadata.storageKey);
      await this.deleteMetadata();
      await sendUploadCallback(
        {
          contractVersion: 1,
          clientIp: metadata.clientIp ?? null,
          type: "upload-failed",
          data: {
            environmentId: metadata.environmentId,
            fileKeyId: metadata.fileKeyId,
            projectId: metadata.projectId,
            error: "Detected MIME type is not allowed for this upload",
          },
        },
        this.env,
      ).catch((callbackError: unknown) => {
        console.error("Failed to send upload failure callback", {
          uploadId: metadata.uploadId,
          callbackError,
        });
      });
      throw Errors.mimeTypeNotAllowed(
        actualMimeType,
        metadata.acceptedMimeTypes,
      );
    }

    metadata.callbackDeliveredAt = metadata.callbackDeliveredAt ?? null;
    await this.persistMetadata(metadata);
    this.logEvent("upload_finalized_bytes", metadata, {
      mode: "do",
      offsetAfter: metadata.offset,
      multipartUploadId: metadata.multipartUploadId,
    });
    return await this.tryDeliverCompletionCallback(metadata, {
      actualSize,
      actualMimeType,
      actualHash,
    });
  }

  private async tryDeliverCompletionCallback(
    metadata: TusUploadMetadata,
    actual?: {
      actualSize: number;
      actualMimeType: string;
      actualHash: string | null;
    },
  ): Promise<UploadCallbackResponse | null> {
    if (metadata.callbackDeliveredAt) {
      await this.deleteMetadata();
      return null;
    }

    let actualSize = actual?.actualSize;
    let actualMimeType = actual?.actualMimeType;
    let actualHash = actual?.actualHash;

    if (actualSize === undefined || actualMimeType === undefined) {
      const object = await this.env.R2_BUCKET.get(metadata.storageKey);
      if (!object) return null;
      actualSize = object.size;
      const headerBytes = await readHeaderBytes(
        object.body as ReadableStream<Uint8Array>,
        8192,
      );
      actualMimeType = await detectMimeType(headerBytes, metadata.fileName);
      actualHash = metadata.claimedHash ?? null;
    }
    const callbackResult = await retry(
      (attempt) => {
        if (attempt > 1) {
          this.logEvent("callback_retry", metadata, {
            mode: "do",
            retryAttempt: attempt,
          });
        }
        return sendUploadCallback(
          {
            contractVersion: 1,
            clientIp: metadata.clientIp ?? null,
            type: "upload-completed",
            data: {
              environmentId: metadata.environmentId,
              fileKeyId: metadata.fileKeyId,
              accessKey: metadata.accessKey,
              fileName: metadata.fileName,
              claimedSize: metadata.claimedSize ?? metadata.size ?? actualSize,
              claimedHash: metadata.claimedHash ?? null,
              claimedMimeType: metadata.claimedMimeType ?? null,
              actualHash: actualHash ?? null,
              actualMimeType,
              actualSize,
              storage: {
                provider: "r2",
                objectKey: metadata.storageKey,
              },
              adapterKey: metadata.storageKey,
              projectId: metadata.projectId,
              isPublic: metadata.isPublic,
              metadata: metadata.metadata,
            },
          },
          this.env,
        );
      },
      { maxAttempts: 4, baseDelayMs: 250, maxDelayMs: 2000 },
    );

    metadata.callbackDeliveredAt = new Date().toISOString();
    await this.persistMetadata(metadata);
    this.logEvent("callback_delivered", metadata, {
      mode: "do",
      offsetAfter: metadata.offset,
    });
    await this.deleteMetadata();
    return callbackResult;
  }

  private async getMetadata(): Promise<TusUploadMetadata | null> {
    const metadata =
      await this.state.storage.get<TusUploadMetadata>(METADATA_KEY);
    return metadata ?? null;
  }

  private async getMultipartRecovery(): Promise<MultipartRecoveryState | null> {
    const state = await this.state.storage.get<MultipartRecoveryState>(
      MULTIPART_RECOVERY_KEY,
    );
    return state ?? null;
  }

  private async persistMetadata(metadata: TusUploadMetadata): Promise<void> {
    await this.state.storage.put(METADATA_KEY, metadata);
  }

  private async persistMultipartRecovery(
    state: MultipartRecoveryState,
  ): Promise<void> {
    await this.state.storage.put(MULTIPART_RECOVERY_KEY, state);
  }

  private async deleteMultipartRecovery(): Promise<void> {
    await this.state.storage.delete(MULTIPART_RECOVERY_KEY);
  }

  private async deleteMetadata(): Promise<void> {
    await Promise.all([
      this.state.storage.delete(METADATA_KEY),
      this.state.storage.delete(MULTIPART_RECOVERY_KEY),
    ]);
  }

  private logEvent(
    event: string,
    metadata: Pick<TusUploadMetadata, "uploadId" | "projectId">,
    extra: Record<string, unknown> = {},
  ): void {
    console.info("[tus-do]", {
      event,
      uploadId: metadata.uploadId,
      projectId: metadata.projectId,
      ...extra,
    });
  }
}
