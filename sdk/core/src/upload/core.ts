import type { z } from "zod";
import { nanoid } from "nanoid";

import type { UpdateFileExpiryInput, UpdateFileExpiryResult } from "./expiry";
import type { CreateSiloCoreFromTokenInput } from "./token";
import type {
  GenerateDownloadUrlInput,
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
  generatePublicDownloadUrl,
  generateSignedDownloadUrl,
  generateSignedUploadUrlWithSecret,
} from "../signing";
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

  async function registerUploadBatch(
    input: RegisterUploadBatchInput,
  ): Promise<RegisterUploadBatchResult> {
    if (input.files.length === 0) {
      throw new Error("registerUploadBatch requires at least one file");
    }
    if (input.dev === true && input.files.length > 1) {
      throw new Error(
        "Dev SSE registration currently supports a single file per request. Call registerUploadBatch once per file when dev=true.",
      );
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
        metadata: file.metadata,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      });
    }

    const registerBody: Record<string, unknown> = {
      environmentId: config.environmentId,
      fileKeys: preparedFilesWithoutUrl.map((file) => ({
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
        fileName: file.fileName,
        size: file.size,
        mimeType: file.mimeType,
        hash: file.hash,
        isPublic: file.isPublic,
        acceptedMimeTypes: file.acceptedMimeTypes,
        metadata: file.metadata,
      })),
      dev: input.dev === true,
    };

    applyFileExpiryToRegisterBody(registerBody, input.fileExpiry);

    if (!input.dev) {
      registerBody.callbackUrl = callbackUrl;
      registerBody.callbackMetadata = input.callbackMetadata ?? {};
    }

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

    async function signPreparedFiles(
      projectSlug: string,
    ): Promise<PreparedUploadFile[]> {
      const preparedFiles: PreparedUploadFile[] = [];
      for (const file of preparedFilesWithoutUrl) {
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
        preparedFiles.push({
          ...file,
          uploadUrl,
        });
      }
      return preparedFiles;
    }

    if (contentType.includes("text/event-stream")) {
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
      const preparedFiles = await signPreparedFiles(projectSlug);
      return {
        mode: "development",
        files: preparedFiles,
        stream: response.body,
        response,
      };
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
      return {
        mode: "development" as const,
        file: firstFile,
        stream: result.stream,
        response: result.response,
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
  ): Promise<string> {
    const projectSlug = input.projectSlug ?? config.projectSlug;
    if (!projectSlug) {
      throw new Error(
        "Missing projectSlug for download URL generation. Provide projectSlug in SILO_TOKEN or input.",
      );
    }

    if (input.isPublic) {
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

  return {
    registerUploadBatch,
    prepareUpload,
    listFiles,
    getFile,
    generateDownloadUrl,
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
