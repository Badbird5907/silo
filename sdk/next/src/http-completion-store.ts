import type { CompletionEntry, CompletionStore } from "./route-handler";

interface CompletionApiResponse {
  ok?: boolean;
  pending?: boolean;
  completion?: CompletionEntry;
  error?: string;
}

export interface CreateHttpCompletionStoreOptions {
  baseUrl: string | URL;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  pathPrefix?: string;
}

function toUrl(baseUrl: string | URL, path: string): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, baseUrl);
}

async function resolveHeaders(
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>),
): Promise<HeadersInit | undefined> {
  if (!headers) return undefined;
  if (typeof headers === "function") {
    return headers();
  }
  return headers;
}

function parseCompletion(payload: CompletionApiResponse): CompletionEntry | null {
  if (!payload.ok || !payload.completion) return null;
  return payload.completion;
}

export function createHttpCompletionStore(
  options: CreateHttpCompletionStoreOptions,
): CompletionStore {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pathPrefix = options.pathPrefix ?? "/api/internal/completion";

  return {
    async set(fileKeyId, value, ttlMs) {
      const response = await fetchImpl(toUrl(options.baseUrl, `${pathPrefix}/set`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await resolveHeaders(options.headers)),
        },
        body: JSON.stringify({
          fileKeyId,
          completion: value,
          ttlSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(
          `Failed to set completion record (${response.status}): ${message || response.statusText}`,
        );
      }
    },
    async get(fileKeyId) {
      const url = toUrl(options.baseUrl, `${pathPrefix}/get`);
      url.searchParams.set("fileKeyId", fileKeyId);
      const response = await fetchImpl(url, {
        method: "GET",
        headers: await resolveHeaders(options.headers),
      });
      if (response.status === 202) return null;
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(
          `Failed to get completion record (${response.status}): ${message || response.statusText}`,
        );
      }
      const payload = (await response.json()) as CompletionApiResponse;
      return parseCompletion(payload);
    },
    async wait(fileKeyId, timeoutMs) {
      const url = toUrl(options.baseUrl, `${pathPrefix}/wait`);
      url.searchParams.set("fileKeyId", fileKeyId);
      url.searchParams.set("timeoutMs", String(Math.max(1, timeoutMs)));
      const response = await fetchImpl(url, {
        method: "GET",
        headers: await resolveHeaders(options.headers),
      });
      if (response.status === 202) return null;
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(
          `Failed to wait for completion record (${response.status}): ${message || response.statusText}`,
        );
      }
      const payload = (await response.json()) as CompletionApiResponse;
      return parseCompletion(payload);
    },
  };
}
