import type { FileRouterInputKey } from "@silo-storage/mime-types";

import {
  expandFileRouterInputKeyToMimeTypes,
  isMimeTypeAllowedByKey,
  lookupMimeTypeFromFile,
  normalizeFileRouterInputKey,
} from "@silo-storage/mime-types";

import type { RouterConfigLike } from "./types";

export function getRouteFileTypeKeys(
  routerConfig: RouterConfigLike | null | undefined,
  endpoint: string,
): FileRouterInputKey[] | undefined {
  const routeConfig = routerConfig?.[endpoint];
  if (
    !routeConfig ||
    typeof routeConfig !== "object" ||
    Array.isArray(routeConfig)
  ) {
    return undefined;
  }

  const normalizedKeys: FileRouterInputKey[] = [];
  for (const key of Object.keys(routeConfig as Record<string, unknown>)) {
    try {
      normalizedKeys.push(normalizeFileRouterInputKey(key));
    } catch {
      continue;
    }
  }

  if (normalizedKeys.length === 0) {
    return undefined;
  }

  return [...new Set(normalizedKeys)];
}

export function buildAcceptAttribute(
  fileTypeKeys: FileRouterInputKey[] | undefined,
): string | undefined {
  if (!fileTypeKeys || fileTypeKeys.length === 0) {
    return undefined;
  }

  if (fileTypeKeys.includes("blob")) {
    return undefined;
  }

  const accepts = new Set<string>();
  for (const key of fileTypeKeys) {
    for (const mimeType of expandFileRouterInputKeyToMimeTypes(key)) {
      accepts.add(mimeType);
    }
  }

  if (accepts.size === 0) {
    return undefined;
  }

  return [...accepts].sort().join(",");
}

export function isFileAllowedByRouteFileTypes(
  file: File,
  fileTypeKeys: FileRouterInputKey[] | undefined,
): boolean {
  if (!fileTypeKeys || fileTypeKeys.length === 0) {
    return true;
  }

  const resolvedMimeType = lookupMimeTypeFromFile(
    file.name,
    file.type || undefined,
  );
  if (!resolvedMimeType) {
    return fileTypeKeys.includes("blob");
  }

  return fileTypeKeys.some((key) =>
    isMimeTypeAllowedByKey(resolvedMimeType, key),
  );
}

export function routeAllowsMultipleFiles(
  routerConfig: RouterConfigLike | null | undefined,
  endpoint: string,
): boolean | undefined {
  const routeConfig = routerConfig?.[endpoint];
  if (
    !routeConfig ||
    typeof routeConfig !== "object" ||
    Array.isArray(routeConfig)
  ) {
    return undefined;
  }

  let hasConstraint = false;
  let hasUnlimitedConstraint = false;
  let maxFileCount = 1;

  for (const constraint of Object.values(
    routeConfig as Record<string, unknown>,
  )) {
    if (
      !constraint ||
      typeof constraint !== "object" ||
      Array.isArray(constraint)
    ) {
      continue;
    }

    hasConstraint = true;
    const maybeMax = (constraint as { maxFileCount?: unknown }).maxFileCount;
    if (maybeMax === undefined) {
      hasUnlimitedConstraint = true;
      continue;
    }

    if (typeof maybeMax !== "number" || !Number.isFinite(maybeMax)) {
      continue;
    }

    maxFileCount = Math.max(maxFileCount, maybeMax);
  }

  if (!hasConstraint) {
    return undefined;
  }

  if (hasUnlimitedConstraint) {
    return true;
  }

  return maxFileCount > 1;
}

export function getRouteMaxFileCount(
  routerConfig: RouterConfigLike | null | undefined,
  endpoint: string,
): number | undefined {
  const routeConfig = routerConfig?.[endpoint];
  if (
    !routeConfig ||
    typeof routeConfig !== "object" ||
    Array.isArray(routeConfig)
  ) {
    return undefined;
  }

  let hasConstraint = false;
  let hasUnlimitedConstraint = false;
  let maxFileCount = 1;

  for (const constraint of Object.values(
    routeConfig as Record<string, unknown>,
  )) {
    if (
      !constraint ||
      typeof constraint !== "object" ||
      Array.isArray(constraint)
    ) {
      continue;
    }

    hasConstraint = true;
    const maybeMax = (constraint as { maxFileCount?: unknown }).maxFileCount;
    if (maybeMax === undefined) {
      hasUnlimitedConstraint = true;
      continue;
    }

    if (typeof maybeMax !== "number" || !Number.isFinite(maybeMax)) {
      continue;
    }

    maxFileCount = Math.max(maxFileCount, maybeMax);
  }

  if (!hasConstraint || hasUnlimitedConstraint) {
    return undefined;
  }

  return maxFileCount;
}
