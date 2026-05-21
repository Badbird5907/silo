import {
  expandFileRouterInputKeysToMimeTypes,
  isMimeTypeAllowedByKey,
  lookupMimeTypeFromFile,
  normalizeFileRouterInputKey,
  stripMimeParameters,
} from "@silo-storage/mime-types";

import type { RouterConfigLike } from "./types";

interface RouteConfigBucketLike {
  type?: string;
  mimeTypes?: string | readonly string[];
  maxFileCount?: number;
}

function normalizeAcceptPattern(value: string): string | undefined {
  try {
    return normalizeFileRouterInputKey(value);
  } catch {
    const normalized = stripMimeParameters(value);
    if (normalized.endsWith("/*")) {
      return normalized;
    }

    return undefined;
  }
}

function isRouteConfigBucketLike(
  value: unknown,
): value is RouteConfigBucketLike {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeRouteConfigBuckets(
  routeConfig: unknown,
): RouteConfigBucketLike[] | undefined {
  if (!routeConfig || typeof routeConfig !== "object") {
    return undefined;
  }

  if (Array.isArray(routeConfig)) {
    const buckets = routeConfig.filter(isRouteConfigBucketLike);
    return buckets.length > 0 ? buckets : undefined;
  }

  return Object.entries(routeConfig as Record<string, unknown>)
    .filter(([, value]) => isRouteConfigBucketLike(value))
    .map(([key, value]) => ({
      type: key,
      ...(value as RouteConfigBucketLike),
    }));
}

function getRouteAcceptPatterns(routeConfig: unknown): string[] | undefined {
  const buckets = normalizeRouteConfigBuckets(routeConfig);
  if (!buckets) {
    return undefined;
  }

  const patterns = new Set<string>();
  for (const bucket of buckets) {
    const normalizedType =
      typeof bucket.type === "string"
        ? normalizeAcceptPattern(bucket.type)
        : undefined;
    if (normalizedType) {
      patterns.add(normalizedType);
    }

    if (bucket.mimeTypes !== undefined) {
      const rawMimeTypes = Array.isArray(bucket.mimeTypes)
        ? bucket.mimeTypes
        : [bucket.mimeTypes];
      for (const mimeType of rawMimeTypes) {
        if (typeof mimeType !== "string") {
          continue;
        }

        const normalizedMimeType = normalizeAcceptPattern(mimeType);
        if (normalizedMimeType) {
          patterns.add(normalizedMimeType);
        }
      }
    }
  }

  if (patterns.size === 0) {
    return undefined;
  }

  return [...patterns];
}

function matchesAcceptPattern(mimeType: string, pattern: string): boolean {
  if (pattern === "blob") {
    return true;
  }

  if (pattern === "image") {
    return mimeType.startsWith("image/");
  }

  if (pattern === "video") {
    return mimeType.startsWith("video/");
  }

  if (pattern === "audio") {
    return mimeType.startsWith("audio/");
  }

  if (pattern === "text") {
    return mimeType.startsWith("text/");
  }

  if (pattern === "pdf") {
    return mimeType === "application/pdf";
  }

  return mimeType === pattern;
}

export function getRouteFileTypeKeys(
  routerConfig: RouterConfigLike | null | undefined,
  endpoint: string,
): string[] | undefined {
  return getRouteAcceptPatterns(routerConfig?.[endpoint]);
}

export function buildAcceptAttribute(
  fileTypeKeys: string[] | undefined,
): string | undefined {
  if (!fileTypeKeys || fileTypeKeys.length === 0) {
    return undefined;
  }

  if (fileTypeKeys.includes("blob")) {
    return undefined;
  }

  const accepts = expandFileRouterInputKeysToMimeTypes(fileTypeKeys, {
    allowWildcard: true,
  });
  return accepts.length > 0 ? accepts.join(",") : undefined;
}

export function isFileAllowedByRouteFileTypes(
  file: File,
  fileTypeKeys: string[] | undefined,
): boolean {
  if (!fileTypeKeys || fileTypeKeys.length === 0) {
    return true;
  }

  const resolvedMimeType = stripMimeParameters(file.type || "");
  const fileMimeType =
    resolvedMimeType.length > 0
      ? resolvedMimeType
      : (lookupMimeTypeFromFile(file.name, undefined) ?? undefined);
  if (!fileMimeType) {
    return fileTypeKeys.includes("blob");
  }

  return fileTypeKeys.some((key) => {
    if (key.endsWith("/*")) {
      return matchesAcceptPattern(fileMimeType, key);
    }

    try {
      return isMimeTypeAllowedByKey(
        fileMimeType,
        normalizeFileRouterInputKey(key),
      );
    } catch {
      return false;
    }
  });
}

export function routeAllowsMultipleFiles(
  routerConfig: RouterConfigLike | null | undefined,
  endpoint: string,
): boolean | undefined {
  const buckets = normalizeRouteConfigBuckets(routerConfig?.[endpoint]);
  if (!buckets) {
    return undefined;
  }

  let hasConstraint = false;
  let hasUnlimitedConstraint = false;
  let maxFileCount = 1;

  for (const bucket of buckets) {
    hasConstraint = true;
    const maybeMax = bucket.maxFileCount;
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
  const buckets = normalizeRouteConfigBuckets(routerConfig?.[endpoint]);
  if (!buckets) {
    return undefined;
  }

  let hasConstraint = false;
  let hasUnlimitedConstraint = false;
  let maxFileCount = 1;

  for (const bucket of buckets) {
    hasConstraint = true;
    const maybeMax = bucket.maxFileCount;
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
