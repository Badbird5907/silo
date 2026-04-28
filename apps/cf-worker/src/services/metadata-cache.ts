import type { Bindings } from "../types/bindings";
import type { FileKeyInfo, ProjectInfo } from "../types/project";

const METADATA_CACHE_NAME = "silo-metadata";
const PROJECT_METADATA_CACHE_TTL_SECONDS = 15;
const FILE_KEY_CACHE_TTL_SECONDS = 10;

function buildCacheUrl(env: Bindings, path: string): string {
  return `https://${env.WORKER_DOMAIN}${path}`;
}

function createProjectCacheRequest(slug: string, env: Bindings): Request {
  return new Request(
    buildCacheUrl(env, `/__cache/project/${encodeURIComponent(slug)}`),
  );
}

function createFileKeyCacheRequest(
  projectId: string,
  accessKey: string,
  signingKeyId: string | null | undefined,
  env: Bindings,
): Request {
  const search = signingKeyId
    ? `?signingKeyId=${encodeURIComponent(signingKeyId)}`
    : "";
  return new Request(
    buildCacheUrl(
      env,
      `/__cache/file-key/${encodeURIComponent(projectId)}/${encodeURIComponent(accessKey)}${search}`,
    ),
  );
}

async function readCachedJson<T>(cacheKey: Request): Promise<T | null> {
  const cache = await caches.open(METADATA_CACHE_NAME);
  const cachedResponse = await cache.match(cacheKey);
  if (!cachedResponse) {
    return null;
  }

  return (await cachedResponse.json()) as T;
}

async function writeCachedJson(
  cacheKey: Request,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const cache = await caches.open(METADATA_CACHE_NAME);
  const response = new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `max-age=${ttlSeconds}`,
    },
  });

  await cache.put(cacheKey, response);
}

export async function getCachedProject(
  slug: string,
  env: Bindings,
): Promise<ProjectInfo | null> {
  return await readCachedJson<ProjectInfo>(createProjectCacheRequest(slug, env));
}

export async function cacheProject(
  slug: string,
  project: ProjectInfo,
  env: Bindings,
): Promise<void> {
  await writeCachedJson(
    createProjectCacheRequest(slug, env),
    project,
    PROJECT_METADATA_CACHE_TTL_SECONDS,
  );
}

function shouldCacheFileKey(fileKey: FileKeyInfo): boolean {
  if (fileKey.status !== "completed") {
    return false;
  }

  if (!fileKey.expiresAt) {
    return true;
  }

  const expiresAt = new Date(fileKey.expiresAt).getTime();
  if (Number.isNaN(expiresAt)) {
    return true;
  }

  return expiresAt - Date.now() > FILE_KEY_CACHE_TTL_SECONDS * 1000;
}

export async function getCachedFileKeyValue(
  accessKey: string,
  projectId: string,
  signingKeyId: string | null | undefined,
  env: Bindings,
): Promise<FileKeyInfo | null> {
  const cached = await readCachedJson<FileKeyInfo>(
    createFileKeyCacheRequest(projectId, accessKey, signingKeyId, env),
  );

  if (!cached) {
    return null;
  }

  // Older cached private records may be missing the per-file signing context
  // now required for private download/image verification.
  if (!cached.isPublic && !cached.downloadSigningSecret) {
    return null;
  }

  return cached;
}

export async function cacheFileKey(
  accessKey: string,
  projectId: string,
  signingKeyId: string | null | undefined,
  fileKey: FileKeyInfo,
  env: Bindings,
): Promise<void> {
  if (!shouldCacheFileKey(fileKey)) {
    return;
  }

  await writeCachedJson(
    createFileKeyCacheRequest(projectId, accessKey, signingKeyId, env),
    fileKey,
    FILE_KEY_CACHE_TTL_SECONDS,
  );
}
