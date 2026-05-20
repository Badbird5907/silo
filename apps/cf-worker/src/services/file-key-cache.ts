import type { Bindings } from "../types/bindings";
import type { FileKeyInfo } from "../types/project";
import { lookupFileKey } from "./callback";
import { cacheFileKey, getCachedFileKeyValue } from "./metadata-cache";

export async function getCachedFileKey(
  accessKey: string,
  projectId: string,
  signingKeyId: string | null | undefined,
  env: Bindings,
): Promise<FileKeyInfo> {
  try {
    const cached = await getCachedFileKeyValue(
      accessKey,
      projectId,
      signingKeyId,
      env,
    );
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.error("Failed to read file key metadata cache:", error);
  }

  const fileKey = await lookupFileKey(accessKey, projectId, signingKeyId, env);

  try {
    await cacheFileKey(accessKey, projectId, signingKeyId, fileKey, env);
  } catch (error) {
    console.error("Failed to write file key metadata cache:", error);
  }

  return fileKey;
}
