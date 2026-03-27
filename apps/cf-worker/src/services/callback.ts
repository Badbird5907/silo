import type { Bindings } from "../types/bindings";
import type {
  FileKeyInfo,
  SignatureVerificationRequest,
  SignatureVerificationResponse,
  UploadCallbackData,
  UploadCallbackResponse,
} from "../types/project";
import {
  errorResponseSchema,
  fileKeyInfoSchema,
  uploadCallbackResponseSchema,
} from "../types/project";

export async function verifyUploadSignature(
  request: SignatureVerificationRequest,
  env: Bindings,
): Promise<SignatureVerificationResponse> {
  const response = await fetch(
    `${env.NEXTJS_CALLBACK_URL}/api/internal/verify-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CALLBACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    try {
      const error: { error?: string } = await response.json();
      console.log("[callback] Error:", error);
      throw new Error(error.error ?? "Signature verification failed");
    } catch {
      throw new Error("Signature verification failed");
    }
  }

  return await response.json();
}

export async function sendUploadCallback(
  data: UploadCallbackData,
  env: Bindings,
): Promise<UploadCallbackResponse> {
  const url = `${env.NEXTJS_CALLBACK_URL}/api/internal/callback`;
  console.log("[callback] cb:", url);
  console.log("[callback] d:", JSON.stringify(data, null, 2));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CALLBACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    console.log("[callback] Response status:", response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error("[callback] Error response:", text);
      const parsed = errorResponseSchema.safeParse(JSON.parse(text));
      if (parsed.success && parsed.data.error) {
        throw new Error(parsed.data.error);
      }
      throw new Error(`Upload callback failed: ${text}`);
    }

    const json = await response.json();
    const result = uploadCallbackResponseSchema.parse(json);
    console.log("[callback] Success:", result);
    return result;
  } catch (error) {
    console.error("[callback] Fetch error:", error);
    throw error;
  }
}

export async function lookupFileKey(
  accessKey: string,
  projectId: string,
  env: Bindings,
): Promise<FileKeyInfo> {
  const response = await fetch(
    `${env.NEXTJS_CALLBACK_URL}/api/internal/lookup-file-key`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CALLBACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessKey, projectId }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    const parsed = errorResponseSchema.safeParse(JSON.parse(text));
    if (parsed.success && parsed.data.error) {
      throw new Error(parsed.data.error);
    }
    throw new Error(`File key lookup failed: ${text}`);
  }

  const json = await response.json();
  return fileKeyInfoSchema.parse(json);
}

interface UploadSessionRegistrationResponse {
  success?: boolean;
  skipped?: boolean;
  error?: string;
  status?: string;
}

async function parseUploadSessionRegistrationResponse(
  response: Response,
): Promise<UploadSessionRegistrationResponse | null> {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    const json: unknown = JSON.parse(text);
    if (json && typeof json === "object") {
      return json as UploadSessionRegistrationResponse;
    }
  } catch {
    return null;
  }

  return null;
}

export async function registerUploadSession(
  data: {
    projectId: string;
    environmentId: string;
    fileKeyId: string;
    uploadId: string;
    storageKey: string;
  },
  env: Bindings,
): Promise<void> {
  const response = await fetch(
    `${env.NEXTJS_CALLBACK_URL}/api/internal/upload-session/start`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CALLBACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...data,
        adapterKey: data.storageKey,
      }),
    },
  );

  const payload = await parseUploadSessionRegistrationResponse(response);

  if (response.ok && payload?.skipped) {
    throw new Error(
      "Upload session registration was skipped because file key is not pending",
    );
  }

  if (!response.ok) {
    const errorDetails = payload?.error ?? response.statusText;
    throw new Error(
      `Failed to register upload session (${response.status}): ${errorDetails}`,
    );
  }
}

export async function registerMultipartUploadSession(
  data: {
    projectId: string;
    environmentId: string;
    fileKeyId: string;
    uploadId: string;
    multipartUploadId: string;
  },
  env: Bindings,
): Promise<void> {
  const response = await fetch(
    `${env.NEXTJS_CALLBACK_URL}/api/internal/upload-session/multipart`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CALLBACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
  );

  const payload = await parseUploadSessionRegistrationResponse(response);

  if (response.ok && payload?.skipped) {
    throw new Error(
      "Multipart upload registration was skipped because file key is not pending",
    );
  }

  if (!response.ok) {
    const errorDetails = payload?.error ?? response.statusText;
    throw new Error(
      `Failed to register multipart upload session (${response.status}): ${errorDetails}`,
    );
  }
}

export interface TrackDownloadData {
  projectId: string;
  environmentId: string;
  fileId: string;
  bytes: number;
}

export interface ReportMissingObjectData {
  projectId: string;
  environmentId: string;
  fileKeyId: string;
  fileId: string;
  accessKey: string;
  storageKey: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function trackDownload(
  data: TrackDownloadData,
  env: Bindings,
): Promise<void> {
  try {
    const response = await fetch(
      `${env.NEXTJS_CALLBACK_URL}/api/internal/track-download`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CALLBACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      },
    );

    if (!response.ok) {
      console.error("[analytics] Failed to track download:", response.status);
    }
  } catch (error) {
    console.error("[analytics] Error tracking download:", error);
  }
}

export async function reportMissingObject(
  data: ReportMissingObjectData,
  env: Bindings,
): Promise<void> {
  const maxAttempts = 4;
  const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(
        `${env.NEXTJS_CALLBACK_URL}/api/internal/files/repair-missing`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CALLBACK_SECRET}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...data,
            adapterKey: data.storageKey,
          }),
        },
      );

      if (response.ok) {
        return;
      }

      const text = await response.text().catch(() => "");
      const retryable = retryableStatuses.has(response.status);

      console.error("[repair] Failed to report missing object", {
        attempt,
        maxAttempts,
        status: response.status,
        retryable,
        details: text,
      });

      if (!retryable || attempt >= maxAttempts) {
        return;
      }
    } catch (error) {
      console.error("[repair] Error reporting missing object", {
        attempt,
        maxAttempts,
        error,
      });

      if (attempt >= maxAttempts) {
        return;
      }
    }

    await sleep(Math.min(200 * 2 ** (attempt - 1), 2000));
  }
}
