import { Upload } from "tus-js-client";

import type { AnyFileRouterLike, RouteInputBySlug, RouteSlug, RouterConfigLike } from "./types";
import { SiloUploadError } from "./types";

interface RegisterResponse {
  ok: boolean;
  endpoint?: string;
  files?: {
    fileKeyId: string;
    accessKey: string;
    uploadUrl: string;
    uploadMethod?: "tus" | "put";
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

function asError(cause: unknown, fallbackCode = "UNKNOWN_ERROR"): SiloUploadError {
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
    uploadMethod?: "tus" | "put";
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
  uploadMethod: "tus" | "put",
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
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
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abortListener);
      resolve();
    };
    const finishReject = (error: SiloUploadError) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abortListener);
      reject(error);
    };

    const upload = new Upload(file, {
      endpoint: uploadUrl,
      uploadSize: file.size,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 1000, 3000],
      onError: (error) => {
        finishReject(
          new SiloUploadError({
            code: "UPLOAD_FAILED",
            message: `File upload failed for "${file.name}"`,
            cause: error,
          }),
        );
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress(bytesUploaded, bytesTotal);
      },
      onSuccess: () => {
        finishResolve();
      },
    });

    const abortListener = () => {
      void upload.abort().finally(() => {
        finishReject(
          new SiloUploadError({
            code: "UPLOAD_ABORTED",
            message: "Upload aborted",
          }),
        );
      });
    };

    if (signal.aborted) {
      abortListener();
      return;
    }

    signal.addEventListener("abort", abortListener, { once: true });
    upload.start();
  });
}
