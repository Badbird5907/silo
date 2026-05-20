import type {
  AnyFileRouterLike,
  RouteInputBySlug,
  RouterConfigLike,
  RouteSlug,
} from "./types";
import { SiloUploadError } from "./types";

interface RegisterResponse {
  ok: boolean;
  endpoint?: string;
  files?: {
    fileKeyId: string;
    accessKey: string;
    uploadUrl: string;
    uploadMethod?: "resumable" | "put";
    fileName: string;
    size: number;
    mimeType?: string;
  }[];
  error?: {
    code?: string;
    message?: string;
  };
}

interface AwaitCompletionResponse {
  ok: boolean;
  pending?: boolean;
  completion?: {
    routeSlug: string;
    fileKeyId: string;
    onUploadCompleteResult: unknown;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

function asError(
  cause: unknown,
  fallbackCode = "UNKNOWN_ERROR",
): SiloUploadError {
  if (cause instanceof SiloUploadError) return cause;
  if (cause instanceof Error) {
    return new SiloUploadError({
      code: fallbackCode,
      message: cause.message,
      cause,
    });
  }
  return new SiloUploadError({
    code: fallbackCode,
    message: "Unknown upload error",
    cause,
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export async function fetchRouterConfig(
  endpoint: string,
  fetchImpl: typeof fetch,
): Promise<RouterConfigLike> {
  const response = await fetchImpl(endpoint, { method: "GET" });
  if (!response.ok) {
    throw asError(
      new Error(`Failed to fetch router config (${response.status})`),
      "ROUTER_CONFIG_ERROR",
    );
  }
  const payload = await readJson<{ routerConfig?: RouterConfigLike }>(response);
  return payload.routerConfig ?? {};
}

export async function registerUpload<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(
  endpointUrl: string,
  fetchImpl: typeof fetch,
  payload: {
    endpoint: TEndpoint;
    input?: RouteInputBySlug<TRouter, TEndpoint>;
    expiresIn?: number;
    protocol?: "http" | "https";
    uploadMethod?: "resumable" | "put";
    files: {
      fileName: string;
      size: number;
      mimeType?: string;
    }[];
  },
): Promise<NonNullable<RegisterResponse["files"]>> {
  const response = await fetchImpl(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      ...payload,
    }),
  });

  const data = await readJson<RegisterResponse>(response);
  if (!response.ok || !data.ok || !data.files) {
    throw new SiloUploadError({
      code: data.error?.code ?? "REGISTER_FAILED",
      message: data.error?.message ?? "Failed to register upload",
      cause: data,
    });
  }

  return data.files;
}

const DEFAULT_COMPLETION_TOTAL_MS = 60_000; // retry for 60 seconds
/** Max time each await-completion HTTP request holds the server polling in-memory state. */
const MAX_COMPLETION_POLL_PER_REQUEST_MS = 4_000;

/**
 * Waits until the route's `onUploadComplete` has run and the result is available.
 * Uses several short server polls so that serverless deployments where the webhook
 * hits a different instance than the poller can succeed on a later attempt.
 */
export async function awaitCompletion(
  endpointUrl: string,
  fetchImpl: typeof fetch,
  fileKeyId: string,
  timeoutMs?: number,
): Promise<NonNullable<AwaitCompletionResponse["completion"]>> {
  const totalBudgetMs = timeoutMs ?? DEFAULT_COMPLETION_TOTAL_MS;
  const deadline = Date.now() + totalBudgetMs;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const serverWaitMs = Math.min(
      MAX_COMPLETION_POLL_PER_REQUEST_MS,
      Math.max(1, remaining),
    );

    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "await-completion",
        fileKeyId,
        timeoutMs: serverWaitMs,
      }),
    });

    const data = await readJson<AwaitCompletionResponse>(response);

    if (response.status === 202 && data.pending) {
      const pauseMs = Math.min(250, Math.max(0, deadline - Date.now()));
      if (pauseMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
      }
      continue;
    }

    if (!response.ok || !data.ok || !data.completion) {
      throw new SiloUploadError({
        code: data.error?.code ?? "COMPLETION_FAILED",
        message: data.error?.message ?? "Failed awaiting upload completion",
        cause: data,
      });
    }

    return data.completion;
  }

  throw new SiloUploadError({
    code: "COMPLETION_PENDING",
    message: "Upload is complete but onUploadComplete has not finished yet.",
    cause: { pending: true },
  });
}

export async function uploadFileWithProgress(
  uploadUrl: string,
  uploadMethod: "resumable" | "put",
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<UploadProgressResult> {
  if (uploadMethod === "put") {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let aborted = false;
      const xhr = new XMLHttpRequest();

      const cleanup = () => {
        signal.removeEventListener("abort", abortListener);
      };
      const finishResolve = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const finishReject = (error: SiloUploadError) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const abortListener = () => {
        aborted = true;
        xhr.abort();
        finishReject(
          new SiloUploadError({
            code: "UPLOAD_ABORTED",
            message: "Upload aborted",
          }),
        );
      };

      xhr.open("PUT", uploadUrl);
      if (file.type) {
        xhr.setRequestHeader("Content-Type", file.type);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress(event.loaded, event.total);
      };
      xhr.onerror = () => {
        finishReject(
          new SiloUploadError({
            code: "UPLOAD_FAILED",
            message: `File upload failed for "${file.name}"`,
          }),
        );
      };
      xhr.onabort = () => {
        if (aborted) return;
        finishReject(
          new SiloUploadError({
            code: "UPLOAD_ABORTED",
            message: "Upload aborted",
          }),
        );
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(file.size, file.size);
          finishResolve();
          return;
        }

        finishReject(
          new SiloUploadError({
            code: "UPLOAD_FAILED",
            message: `File upload failed for "${file.name}"`,
            cause: {
              status: xhr.status,
              responseText: xhr.responseText,
            },
          }),
        );
      };

      if (signal.aborted) {
        abortListener();
        return;
      }

      signal.addEventListener("abort", abortListener, { once: true });
      xhr.send(file);
    });
    return { delivered: false };
  }

  return await uploadResumableFileWithProgress(
    uploadUrl,
    file,
    onProgress,
    signal,
  );
}

interface ResumableStatusResponse {
  ok?: boolean;
  uploadId?: string;
  offset?: number;
  size?: number | null;
  completion?: {
    onUploadCompleteResult?: unknown;
  };
  completionDelivered?: boolean;
  error?: string;
}

interface ResumableUploadResponse extends ResumableStatusResponse {
  complete?: boolean;
  onUploadCompleteResult?: unknown;
}

export interface UploadProgressResult {
  delivered: boolean;
  onUploadCompleteResult?: unknown;
}

export function resolveResumableUploadUrl(
  baseUploadUrl: string,
  uploadId: string,
): string {
  const url = new URL(baseUploadUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${encodeURIComponent(uploadId)}`;
  return url.toString();
}

async function uploadResumableFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<UploadProgressResult> {
  const createResponse = await fetch(uploadUrl, {
    method: "POST",
    signal,
  });
  const createData = (await createResponse
    .json()
    .catch(() => null)) as ResumableStatusResponse | null;
  if (!createResponse.ok || !createData?.uploadId) {
    throw new SiloUploadError({
      code: "UPLOAD_CREATE_FAILED",
      message:
        createData?.error ??
        `Failed to create resumable upload (${createResponse.status})`,
      cause: createData,
    });
  }

  const partUrl = resolveResumableUploadUrl(uploadUrl, createData.uploadId);
  let offset = createData.offset ?? 0;
  onProgress(offset, file.size);

  while (offset < file.size) {
    const chunk = file.slice(offset);
    const end = file.size - 1;
    const response = await fetch(partUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Range": `bytes ${offset}-${end}/${file.size}`,
      },
      body: chunk,
      signal,
    });

    const data = (await response
      .json()
      .catch(() => null)) as ResumableUploadResponse | null;
    if (!response.ok || !data?.ok) {
      throw new SiloUploadError({
        code:
          response.status === 409 ? "UPLOAD_OFFSET_MISMATCH" : "UPLOAD_FAILED",
        message:
          data?.error ??
          `File upload failed for "${file.name}" (${response.status})`,
        cause: data,
      });
    }

    offset = data.offset ?? file.size;
    onProgress(offset, file.size);

    if (data.complete) {
      return {
        delivered: data.completionDelivered === true,
        onUploadCompleteResult:
          data.onUploadCompleteResult ?? data.completion?.onUploadCompleteResult,
      };
    }
  }

  const statusResponse = await fetch(partUrl, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  const statusData = (await statusResponse
    .json()
    .catch(() => null)) as ResumableStatusResponse | null;
  if (statusResponse.ok && statusData?.completion) {
    return {
      delivered: statusData.completionDelivered === true,
      onUploadCompleteResult: statusData.completion.onUploadCompleteResult,
    };
  }

  return { delivered: false };
}
