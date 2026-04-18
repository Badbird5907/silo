import type { Bindings } from "../types/bindings";
import type { FileKeyInfo } from "../types/project";
import { lookupFileKey } from "./callback";

const FILE_KEY_CACHE_TTL = 60;

export async function getCachedFileKey(
  accessKey: string,
  projectId: string,
  env: Bindings,
): Promise<FileKeyInfo> {
  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.internal/file-key/${projectId}/${accessKey}`,
  );

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse.json();
  }

  const fileKey = await lookupFileKey(accessKey, projectId, env);

  const response = new Response(JSON.stringify(fileKey), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `max-age=${FILE_KEY_CACHE_TTL}`,
    },
  });
  await cache.put(cacheKey, response);

  return fileKey;
}
