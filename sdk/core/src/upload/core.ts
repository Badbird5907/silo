import type { z } from "zod";
import { nanoid } from "nanoid";

import type { UpdateFileAccessInput, UpdateFileAccessResult } from "./access";
import type { DeleteFileInput, DeleteFileResult } from "./delete";
import type { UpdateFileExpiryInput, UpdateFileExpiryResult } from "./expiry";
import type { CreateSiloCoreFromTokenInput } from "./token";
import type {
  GenerateDownloadUrlInput,
  GenerateDownloadUrlOverrides,
  GenerateImageUrlInput,
  GenerateImageUrlOverrides,
  GenerateUrlFileLike,
  GetFileInput,
  ListFilesInput,
  ListFilesResult,
  PreparedUploadFile,
  PrepareUploadInput,
  RegisterUploadBatchInput,
  RegisterUploadBatchResult,
  SiloFileDetail,
  UploadCoreConfig,
  UploadStrategy,
} from "./types";
import {
  generatePublicImageUrl,
  generatePublicDownloadUrl,
  generateSignedImageUrl,
  generateSignedDownloadUrl,
  generateSignedUploadUrlWithSecret,
} from "../signing";
import {
  createUpdateFileAccessRequestBody,
  updateFileAccessResultSchema,
} from "./access";
import {
  createDeleteFileRequestBody,
  deleteFileResultSchema,
} from "./delete";
import {
  applyFileExpiryToRegisterBody,
  createUpdateFileExpiryRequestBody,
  updateFileExpiryResultSchema,
} from "./expiry";
import {
  fileDetailSchema,
  listFilesResultSchema,
  parseRegisterResponseBody,
  parseUploadResponseBody,
} from "./schemas";
import { parseSiloToken } from "./token";

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function createDefaultAccessKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function resolveProtocol(
  apiBaseUrl: string,
  protocol?: "http" | "https",
): "http" | "https" {
  if (protocol) return protocol;
  return apiBaseUrl.startsWith("http://") ? "http" : "https";
}

function requireAbsoluteCallbackUrl(value: string): string {
  if (!isAbsoluteUrl(value)) {
    throw new Error(
      "callbackUrl must be an absolute URL in sdk-core. Resolve origin/path in your framework adapter.",
    );
  }
  return value;
}

type GenerateDownloadUrlSource =
  | string
  | GenerateDownloadUrlInput
  | GenerateUrlFileLike;
type GenerateImageUrlSource =
  | string
  | GenerateImageUrlInput
  | GenerateUrlFileLike;
type GenerateDownloadUrlObjectSource = GenerateUrlFileLike &
  Partial<GenerateDownloadUrlInput>;
type GenerateImageUrlObjectSource = GenerateUrlFileLike &
  Partial<GenerateImageUrlInput>;

interface NormalizedGenerateDownloadUrlInput {
  input: GenerateDownloadUrlInput;
  sign?: boolean;
}

interface NormalizedGenerateImageUrlInput {
  input: GenerateImageUrlInput;
  sign?: boolean;
}

function resolveGenerateUrlFileKeyId(
  source: GenerateDownloadUrlInput | GenerateImageUrlInput | GenerateUrlFileLike,
): string {
  return source.fileKeyId ?? ("id" in source ? source.id : undefined) ?? source.accessKey;
}

function normalizeGenerateDownloadUrlInput(
  source: GenerateDownloadUrlSource,
  overrides?: GenerateDownloadUrlOverrides,
): NormalizedGenerateDownloadUrlInput {
  const sourceInput: GenerateDownloadUrlObjectSource =
    typeof source === "string" ? { accessKey: source } : source;

  return {
    sign: overrides?.sign,
    input: {
      accessKey: sourceInput.accessKey,
      isPublic:
        overrides?.sign === undefined
          ? sourceInput.isPublic ?? false
          : !overrides.sign,
      fileKeyId:
        overrides?.fileKeyId ?? resolveGenerateUrlFileKeyId(sourceInput),
      fileName: overrides?.fileName ?? sourceInput.fileName,
      expiresIn: overrides?.expiresIn ?? sourceInput.expiresIn,
      projectSlug: overrides?.projectSlug ?? sourceInput.projectSlug,
    },
  };
}

function normalizeGenerateImageUrlInput(
  source: GenerateImageUrlSource,
  overrides?: GenerateImageUrlOverrides,
): NormalizedGenerateImageUrlInput {
  const sourceInput: GenerateImageUrlObjectSource =
    typeof source === "string" ? { accessKey: source } : source;

  return {
    sign: overrides?.sign,
    input: {
      accessKey: sourceInput.accessKey,
      isPublic:
        overrides?.sign === undefined
          ? sourceInput.isPublic ?? false
          : !overrides.sign,
      serveImage: sourceInput.serveImage ?? null,
      fileKeyId:
        overrides?.fileKeyId ?? resolveGenerateUrlFileKeyId(sourceInput),
      fileName: overrides?.fileName ?? sourceInput.fileName,
      expiresIn: overrides?.expiresIn ?? sourceInput.expiresIn,
      projectSlug: overrides?.projectSlug ?? sourceInput.projectSlug,
      width: overrides?.width ?? sourceInput.width,
      quality: overrides?.quality ?? sourceInput.quality,
      format: overrides?.format ?? sourceInput.format,
    },
  };
}

export function createSiloCore(config: UploadCoreConfig) {
  const baseUrl = stripTrailingSlash(config.apiBaseUrl);
  const fetchImpl = config.fetch ?? fetch;
  const resolvedRouteMode = config.routeMode ?? "subdomain";

  async function parseApiResponse<T>(
    response: Response,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const json: unknown = await response.json();
    if (!json || typeof json !== "object" || !("data" in json)) {
      throw new Error("Unexpected API response shape: missing data envelope");
    }

    try {
      return schema.parse((json as { data: unknown }).data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unexpected API response shape: ${message}`);
    }
  }

  async function updateFileExpiry(
    input: UpdateFileExpiryInput,
  ): Promise<UpdateFileExpiryResult> {
    const body = createUpdateFileExpiryRequestBody(input, config.environmentId);

    const response = await fetchImpl(
      `${baseUrl}/api/v1/files/${encodeURIComponent(input.fileKeyId)}/expiry`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Update file expiry request failed (${response.status}): ${text || response.statusText}`,
      );
    }

    return parseApiResponse(response, updateFileExpiryResultSchema);
  }

  async function updateFileAccess(
    input: UpdateFileAccessInput,
  ): Promise<UpdateFileAccessResult> {
    const body = createUpdateFileAccessRequestBody(input, config.environmentId);

    const response = await fetchImpl(
      `${baseUrl}/api/v1/files/${encodeURIComponent(input.fileKeyId)}/access`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Update file access request failed (${response.status}): ${text || response.statusText}`,
      );
    }

    return parseApiResponse(response, updateFileAccessResultSchema);
  }

  async function deleteFile(input: DeleteFileInput): Promise<DeleteFileResult> {
    const body = createDeleteFileRequestBody(input, config.environmentId);

    const response = await fetchImpl(`${baseUrl}/api/v1/delete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Delete file request failed (${response.status}): ${text || response.statusText}`,
      );
    }

    const json: unknown = await response.json();
    try {
      return {
        httpStatus: response.status,
        ...deleteFileResultSchema.parse(json),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unexpected delete response shape: ${message}`);
    }
  }

  async function registerUploadBatch(
    input: RegisterUploadBatchInput,
  ): Promise<RegisterUploadBatchResult> {
    if (input.files.length === 0) {
      throw new Error("registerUploadBatch requires at least one file");
    }

    const protocol = resolveProtocol(baseUrl, input.protocol);
    const expiresIn = input.expiresIn ?? 3600;
    const resolvedUploadStrategy: UploadStrategy =
      input.uploadStrategy ?? config.uploadStrategy ?? "server";
    const effectiveUploadStrategy: UploadStrategy =
      resolvedUploadStrategy === "server" && input.dev === true
        ? "self"
        : resolvedUploadStrategy;

    const callbackUrlInput = input.callbackUrl ?? config.callbackUrl;
    let callbackUrl: string | undefined;
    if (!input.dev) {
      if (!callbackUrlInput) {
        throw new Error(
          "Missing callbackUrl for production upload registration. Provide callbackUrl in createSiloCore config or per request.",
        );
      }
      callbackUrl = requireAbsoluteCallbackUrl(callbackUrlInput);
    }

    if (effectiveUploadStrategy === "server") {
      const preparedFiles: PreparedUploadFile[] = [];
      for (const file of input.files) {
        const requestBody: Record<string, unknown> = {
          environmentId: config.environmentId,
          fileKeyId: file.fileKeyId,
          accessKey: file.accessKey ?? createDefaultAccessKey(),
          fileName: file.fileName,
          size: file.size,
          hash: file.hash,
          mimeType: file.mimeType,
          acceptedMimeTypes: file.acceptedMimeTypes,
          isPublic: file.isPublic,
          serveImage: file.serveImage,
          metadata: file.metadata,
          callbackUrl,
          callbackMetadata: input.callbackMetadata ?? {},
          dev: input.dev === true,
        };
        applyFileExpiryToRegisterBody(requestBody, input.fileExpiry);

        const response = await fetchImpl(`${baseUrl}/api/v1/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Upload request failed (${response.status}): ${text || response.statusText}`,
          );
        }

        const parsed = parseUploadResponseBody(await response.json());
        preparedFiles.push({
          fileKeyId: parsed.fileKeyId,
          accessKey: parsed.accessKey,
          uploadUrl: parsed.uploadUrl,
          fileName: file.fileName,
          size: file.size,
          hash: file.hash,
          mimeType: file.mimeType,
          acceptedMimeTypes: file.acceptedMimeTypes,
          isPublic: file.isPublic,
          serveImage: file.serveImage,
          metadata: file.metadata,
          expiresAt: parsed.expiresAt,
        });
      }

      const registerResponse = {
        success: true as const,
        fileKeys: preparedFiles.map((file) => ({
          fileKeyId: file.fileKeyId,
          accessKey: file.accessKey,
          status: "pending",
        })),
      };

      const byFileKeyId = new Map(
        registerResponse.fileKeys.map((item) => [item.fileKeyId, item]),
      );

      return {
        mode: "production",
        registerResponse,
        files: preparedFiles.map((file) => ({
          ...file,
          registration: byFileKeyId.get(file.fileKeyId) ?? null,
        })),
      };
    }

    if (!config.signingSecret || !config.keyId) {
      throw new Error(
        'Self upload strategy requires keyId and signingSecret. Provide these in createSiloCore config or switch to uploadStrategy: "server".',
      );
    }
    const selfSigningSecret = config.signingSecret;
    const selfKeyId = config.keyId;

    const preparedFilesWithoutUrl: (Omit<PreparedUploadFile, "uploadUrl"> & {
      uploadUrl?: string;
    })[] = [];
    for (const file of input.files) {
      const fileKeyId = file.fileKeyId ?? nanoid(16);
      const accessKey = file.accessKey ?? createDefaultAccessKey();
      preparedFilesWithoutUrl.push({
        fileKeyId,
        accessKey,
        fileName: file.fileName,
        size: file.size,
        hash: file.hash,
        mimeType: file.mimeType,
        acceptedMimeTypes: file.acceptedMimeTypes,
        isPublic: file.isPublic,
        serveImage: file.serveImage,
        metadata: file.metadata,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      });
    }

    function toRegisterFileKey(
      file: Omit<PreparedUploadFile, "uploadUrl"> & {
        uploadUrl?: string;
      },
    ) {
      return {
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
        fileName: file.fileName,
        size: file.size,
        mimeType: file.mimeType,
        hash: file.hash,
        isPublic: file.isPublic,
        serveImage: file.serveImage,
        acceptedMimeTypes: file.acceptedMimeTypes,
        metadata: file.metadata,
      };
    }

    async function signPreparedFile(
      projectSlug: string,
      file: Omit<PreparedUploadFile, "uploadUrl"> & {
        uploadUrl?: string;
      },
    ): Promise<PreparedUploadFile> {
      const uploadUrl = await generateSignedUploadUrlWithSecret(
        config.ingestServer,
        projectSlug,
        {
          environmentId: config.environmentId,
          fileKeyId: file.fileKeyId,
          accessKey: file.accessKey,
          fileName: file.fileName,
          size: file.size,
          hash: file.hash,
          mimeType: file.mimeType,
          acceptedMimeTypes: file.acceptedMimeTypes,
          isPublic: file.isPublic,
          keyId: selfKeyId,
          expiresIn,
          protocol,
        },
        selfSigningSecret,
        { routeMode: resolvedRouteMode },
      );

      return {
        ...file,
        uploadUrl,
      };
    }

    async function signPreparedFiles(
      projectSlug: string,
    ): Promise<PreparedUploadFile[]> {
      const preparedFiles: PreparedUploadFile[] = [];
      for (const file of preparedFilesWithoutUrl) {
        preparedFiles.push(await signPreparedFile(projectSlug, file));
      }
      return preparedFiles;
    }

    if (input.dev) {
      const preparedFiles: PreparedUploadFile[] = [];
      const streams: ReadableStream<Uint8Array>[] = [];
      const responses: Response[] = [];

      for (const file of preparedFilesWithoutUrl) {
        const registerBody: Record<string, unknown> = {
          environmentId: config.environmentId,
          fileKeys: [toRegisterFileKey(file)],
          dev: true,
        };

        applyFileExpiryToRegisterBody(registerBody, input.fileExpiry);

        const response = await fetchImpl(`${baseUrl}/api/v1/upload/register`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(registerBody),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Upload register request failed (${response.status}): ${text || response.statusText}`,
          );
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          throw new Error(
            "Dev upload register request failed: expected an SSE response.",
          );
        }
        if (!response.body) {
          throw new Error(
            "Register returned an SSE response without a readable body",
          );
        }

        const projectSlug = response.headers.get("x-silo-project-slug");
        if (!projectSlug) {
          throw new Error(
            "Register SSE response is missing x-silo-project-slug header.",
          );
        }

        preparedFiles.push(await signPreparedFile(projectSlug, file));
        streams.push(response.body);
        responses.push(response);
      }

      const firstStream = streams[0];
      const firstResponse = responses[0];
      if (!firstStream || !firstResponse) {
        throw new Error(
          "Dev upload registration did not produce any SSE streams.",
        );
      }

      return {
        mode: "development",
        files: preparedFiles,
        streams,
        responses,
      };
    }

    const registerBody: Record<string, unknown> = {
      environmentId: config.environmentId,
      fileKeys: preparedFilesWithoutUrl.map(toRegisterFileKey),
      dev: false,
    };

    applyFileExpiryToRegisterBody(registerBody, input.fileExpiry);
    registerBody.callbackUrl = callbackUrl;
    registerBody.callbackMetadata = input.callbackMetadata ?? {};

    const response = await fetchImpl(`${baseUrl}/api/v1/upload/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registerBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Upload register request failed (${response.status}): ${text || response.statusText}`,
      );
    }

    const parsedJson = parseRegisterResponseBody(await response.json());
    const preparedFiles = await signPreparedFiles(parsedJson.projectSlug);
    const byFileKeyId = new Map(
      parsedJson.fileKeys.map((item) => [item.fileKeyId, item]),
    );
    return {
      mode: "production",
      registerResponse: parsedJson,
      files: preparedFiles.map((file) => ({
        ...file,
        registration: byFileKeyId.get(file.fileKeyId) ?? null,
      })),
    };
  }

  async function prepareUpload(input: PrepareUploadInput) {
    const result = await registerUploadBatch({
      ...input,
      files: [input.file],
    });

    const firstFile = result.files[0];
    if (!firstFile) {
      throw new Error("prepareUpload failed to produce file metadata");
    }

    if (result.mode === "development") {
      const firstStream = result.streams[0];
      const firstResponse = result.responses[0];
      if (!firstStream || !firstResponse) {
        throw new Error(
          "prepareUpload failed to produce a development SSE stream",
        );
      }

      return {
        mode: "development" as const,
        file: firstFile,
        stream: firstStream,
        response: firstResponse,
      };
    }

    return {
      mode: "production" as const,
      file: firstFile,
      registerResponse: result.registerResponse,
    };
  }

  async function listFiles(input: ListFilesInput): Promise<ListFilesResult> {
    const resolvedProjectId = input.projectId;
    const resolvedEnvironmentId = input.environmentId ?? config.environmentId;

    if (!resolvedProjectId && !resolvedEnvironmentId) {
      throw new Error(
        "listFiles requires projectId or environmentId. Provide projectId explicitly or configure/create from token with an environmentId.",
      );
    }

    const query = new URLSearchParams();
    if (resolvedProjectId) query.set("projectId", resolvedProjectId);
    if (resolvedEnvironmentId) {
      query.set("environmentId", resolvedEnvironmentId);
    }

    if (input.page !== undefined) query.set("page", input.page.toString());
    if (input.pageSize !== undefined) {
      query.set("pageSize", input.pageSize.toString());
    }
    if (input.search) query.set("search", input.search);
    if (input.status) query.set("status", input.status);
    if (input.metadata) query.set("metadata", JSON.stringify(input.metadata));

    const response = await fetchImpl(
      `${baseUrl}/api/v1/files?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `List files request failed (${response.status}): ${text || response.statusText}`,
      );
    }

    return parseApiResponse(response, listFilesResultSchema);
  }

  async function getFile(input: GetFileInput): Promise<SiloFileDetail> {
    const query = new URLSearchParams({
      projectId: input.projectId,
      environmentId: input.environmentId ?? config.environmentId,
    });

    const response = await fetchImpl(
      `${baseUrl}/api/v1/files/${encodeURIComponent(input.fileKeyId)}?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Get file request failed (${response.status}): ${text || response.statusText}`,
      );
    }

    return parseApiResponse(response, fileDetailSchema);
  }

  async function generateDownloadUrl(
    input: GenerateDownloadUrlInput,
  ): Promise<string>;
  async function generateDownloadUrl(
    accessKey: string,
    overrides?: GenerateDownloadUrlOverrides,
  ): Promise<string>;
  async function generateDownloadUrl(
    file: GenerateUrlFileLike,
    overrides?: GenerateDownloadUrlOverrides,
  ): Promise<string>;
  async function generateDownloadUrl(
    source: GenerateDownloadUrlSource,
    overrides?: GenerateDownloadUrlOverrides,
  ): Promise<string> {
    const normalized = normalizeGenerateDownloadUrlInput(source, overrides);
    const { input, sign } = normalized;
    const projectSlug = input.projectSlug ?? config.projectSlug;
    if (!projectSlug) {
      throw new Error(
        "Missing projectSlug for download URL generation. Provide projectSlug in SILO_TOKEN or input.",
      );
    }

    if (sign === false || (sign === undefined && input.isPublic)) {
      return generatePublicDownloadUrl(
        config.ingestServer,
        projectSlug,
        input.accessKey,
        input.fileName,
        { routeMode: resolvedRouteMode },
      );
    }

    return generateSignedDownloadUrl(
      config.ingestServer,
      projectSlug,
      {
        fileKeyId: input.fileKeyId ?? input.accessKey,
        accessKey: input.accessKey,
        fileName: input.fileName,
        expiresIn: input.expiresIn,
      },
      (() => {
        if (!config.signingSecret) {
          throw new Error(
            "Missing signingSecret for private download URL generation.",
          );
        }
        return config.signingSecret;
      })(),
      { routeMode: resolvedRouteMode },
    );
  }

  async function generateImageUrl(
    input: GenerateImageUrlInput,
  ): Promise<string>;
  async function generateImageUrl(
    accessKey: string,
    overrides?: GenerateImageUrlOverrides,
  ): Promise<string>;
  async function generateImageUrl(
    file: GenerateUrlFileLike,
    overrides?: GenerateImageUrlOverrides,
  ): Promise<string>;
  async function generateImageUrl(
    source: GenerateImageUrlSource,
    overrides?: GenerateImageUrlOverrides,
  ): Promise<string> {
    const normalized = normalizeGenerateImageUrlInput(source, overrides);
    const { input, sign } = normalized;
    const projectSlug = input.projectSlug ?? config.projectSlug;
    if (!projectSlug) {
      throw new Error(
        "Missing projectSlug for image URL generation. Provide projectSlug in SILO_TOKEN or input.",
      );
    }

    if (
      sign === false ||
      (sign === undefined &&
        (input.isPublic || input.serveImage === true))
    ) {
      return generatePublicImageUrl(
        config.ingestServer,
        projectSlug,
        input.accessKey,
        {
          fileName: input.fileName,
          width: input.width,
          quality: input.quality,
          format: input.format,
        },
        { routeMode: resolvedRouteMode },
      );
    }

    return generateSignedImageUrl(
      config.ingestServer,
      projectSlug,
      {
        accessKey: input.accessKey,
        fileName: input.fileName,
        expiresIn: input.expiresIn,
        width: input.width,
        quality: input.quality,
        format: input.format,
      },
      (() => {
        if (!config.signingSecret) {
          throw new Error(
            "Missing signingSecret for private image URL generation.",
          );
        }
        return config.signingSecret;
      })(),
      { routeMode: resolvedRouteMode },
    );
  }

  return {
    registerUploadBatch,
    prepareUpload,
    listFiles,
    getFile,
    deleteFile,
    generateDownloadUrl,
    generateImageUrl,
    updateFileAccess,
    updateFileExpiry,
    config,
  };
}

export type UploadCore = ReturnType<typeof createSiloCore>;

export function createSiloCoreFromToken(
  input: CreateSiloCoreFromTokenInput,
): UploadCore {
  const parsed = parseSiloToken(input.token);

  return createSiloCore({
    apiBaseUrl: input.url,
    apiKey: parsed.apiKey,
    keyId: parsed.apiKeyId,
    environmentId: parsed.environmentId,
    ingestServer: input.cdnHost,
    signingSecret: parsed.signingSecret,
    uploadStrategy: input.uploadStrategy,
    routeMode: parsed.routeMode,
    projectSlug: parsed.projectSlug,
    callbackUrl: input.callbackUrl,
    fetch: input.fetch,
  });
}
