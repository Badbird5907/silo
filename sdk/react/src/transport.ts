import { Upload } from "tus-js-client";

import type { RouterConfigLike } from "./types";
import { SiloUploadError } from "./types";

interface RegisterResponse {
  ok: boolean;
  endpoint?: string;
  files?: {
    fileKeyId: string;
    accessKey: string;
    uploadUrl: string;
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

export async function registerUpload(
  endpointUrl: string,
  fetchImpl: typeof fetch,
  payload: {
    endpoint: string;
    input?: unknown;
    expiresIn?: number;
    protocol?: "http" | "https";
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

export async function awaitCompletion(
  endpointUrl: string,
  fetchImpl: typeof fetch,
  fileKeyId: string,
  timeoutMs?: number,
): Promise<NonNullable<AwaitCompletionResponse["completion"]>> {
  const response = await fetchImpl(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "await-completion",
      fileKeyId,
      timeoutMs,
    }),
  });

  const data = await readJson<AwaitCompletionResponse>(response);
  if (response.status === 202 && data.pending) {
    throw new SiloUploadError({
      code: "COMPLETION_PENDING",
      message: "Upload is complete but onUploadComplete has not finished yet.",
      cause: data,
    });
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

export async function uploadFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
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
      metadata: {
        filename: file.name,
        filetype: file.type || "application/octet-stream",
      },
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
