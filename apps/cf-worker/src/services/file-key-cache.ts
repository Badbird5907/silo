import type { Bindings } from "../types/bindings";
import type { FileKeyInfo } from "../types/project";
import {
  cacheFileKey,
  getCachedFileKeyValue,
} from "./metadata-cache";
import { lookupFileKey } from "./callback";

export async function getCachedFileKey(
  accessKey: string,
  projectId: string,
  env: Bindings,
): Promise<FileKeyInfo> {
  try {
    const cached = await getCachedFileKeyValue(accessKey, projectId, env);
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.error("Failed to read file key metadata cache:", error);
  }

  const fileKey = await lookupFileKey(accessKey, projectId, env);

  try {
    await cacheFileKey(accessKey, projectId, fileKey, env);
  } catch (error) {
    console.error("Failed to write file key metadata cache:", error);
  }

  return fileKey;
}
