import type { UploadFileInput } from "@silo-storage/sdk-core";

import {
  isAllowedFileType,
  lookupMimeTypeFromFile,
  stripMimeParameters,
} from "@silo-storage/mime-types";

import type { SiloRouteConfig, SiloRouteConfigBucket } from "./types";
import { parseMaxFileSizeBytes } from "./normalize";

function normalizeMimeTypeValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = stripMimeParameters(value);
  return normalized.length > 0 ? normalized : undefined;
}

function resolveFileMimeType(file: UploadFileInput): string | undefined {
  const normalizedProvided = normalizeMimeTypeValue(file.mimeType);
  if (normalizedProvided) {
    return normalizedProvided;
  }

  return lookupMimeTypeFromFile(file.fileName, undefined) ?? undefined;
}

function bucketRank(bucket: SiloRouteConfigBucket): number {
  if (bucket.type === "blob") return 1;
  if (bucket.type && isAllowedFileType(bucket.type)) return 2;
  return 3;
}

function bucketLabel(bucket: SiloRouteConfigBucket): string {
  if (bucket.type && !bucket.mimeTypes) {
    return bucket.type;
  }

  if (bucket.type && bucket.mimeTypes) {
    return `${bucket.type} (${bucket.mimeTypes.join(", ")})`;
  }

  if (bucket.mimeTypes) {
    return bucket.mimeTypes.join(", ");
  }

  return "unknown bucket";
}

function bucketMatchesMimeType(
  bucket: SiloRouteConfigBucket,
  mimeType: string | undefined,
): boolean {
  if (!mimeType) {
    return bucket.type === "blob";
  }

  if (bucket.mimeTypes && !bucket.mimeTypes.includes(mimeType)) {
    return false;
  }

  if (!bucket.type) {
    return Boolean(bucket.mimeTypes?.includes(mimeType));
  }

  if (bucket.type === "blob") {
    return true;
  }

  if (isAllowedFileType(bucket.type)) {
    if (bucket.type === "image") return mimeType.startsWith("image/");
    if (bucket.type === "video") return mimeType.startsWith("video/");
    if (bucket.type === "audio") return mimeType.startsWith("audio/");
    if (bucket.type === "pdf") return mimeType === "application/pdf";
    return mimeType.startsWith("text/");
  }

  return mimeType === bucket.type;
}

export function enforceRouteConfigConstraints(
  routeSlug: string,
  routeConfig: SiloRouteConfig,
  files: UploadFileInput[],
): (string[] | undefined)[] {
  if (routeConfig.length === 0) {
    return files.map(() => undefined);
  }

  const parsedEntries = routeConfig.map((bucket, index) => ({
    ...bucket,
    index,
    maxFileSizeBytes: bucket.maxFileSize
      ? parseMaxFileSizeBytes(bucket.maxFileSize)
      : undefined,
  }));

  const countByRouteKey = new Map<number, number>();
  const derivedAcceptedMimeTypesByFile: (string[] | undefined)[] = [];
  for (const entry of parsedEntries) {
    countByRouteKey.set(entry.index, 0);
  }

  for (const file of files) {
    if (!Number.isFinite(file.size) || file.size < 0) {
      throw new Error(
        `Route "${routeSlug}" received invalid file size for "${file.fileName}".`,
      );
    }

    const resolvedMimeType = resolveFileMimeType(file);
    const matchingEntries = parsedEntries.filter((entry) =>
      bucketMatchesMimeType(entry, resolvedMimeType),
    );

    let matchedEntry = matchingEntries[0];
    if (matchingEntries.length > 1) {
      const highestRank = Math.max(
        ...matchingEntries.map((entry) => bucketRank(entry)),
      );
      const highestRankEntries = matchingEntries.filter(
        (entry) => bucketRank(entry) === highestRank,
      );

      if (highestRankEntries.length > 1) {
        throw new Error(
          `Route "${routeSlug}" file "${file.fileName}" matches multiple file type buckets: ${highestRankEntries
            .map((entry) => bucketLabel(entry))
            .join(", ")}.`,
        );
      }

      matchedEntry = highestRankEntries[0];
    }

    if (!matchedEntry) {
      if (!resolvedMimeType) {
        throw new Error(
          `Route "${routeSlug}" does not allow file "${file.fileName}" because its MIME type could not be determined from browser type or filename extension.`,
        );
      }
      throw new Error(
        `Route "${routeSlug}" does not allow MIME type "${resolvedMimeType}" for "${file.fileName}".`,
      );
    }

    const count = (countByRouteKey.get(matchedEntry.index) ?? 0) + 1;
    countByRouteKey.set(matchedEntry.index, count);

    if (
      matchedEntry.maxFileCount !== undefined &&
      count > matchedEntry.maxFileCount
    ) {
      throw new Error(
        `Route "${routeSlug}" allows at most ${matchedEntry.maxFileCount} file(s) for "${bucketLabel(matchedEntry)}".`,
      );
    }

    if (
      matchedEntry.maxFileSizeBytes !== undefined &&
      file.size > matchedEntry.maxFileSizeBytes
    ) {
      throw new Error(
        `Route "${routeSlug}" file "${file.fileName}" exceeds maxFileSize ${matchedEntry.maxFileSize} for "${bucketLabel(matchedEntry)}".`,
      );
    }

    derivedAcceptedMimeTypesByFile.push(
      matchedEntry.mimeTypes
        ? [...matchedEntry.mimeTypes]
        : matchedEntry.type
          ? [matchedEntry.type]
          : undefined,
    );
  }

  for (const entry of parsedEntries) {
    const count = countByRouteKey.get(entry.index) ?? 0;
    if (entry.minFileCount !== undefined && count < entry.minFileCount) {
      throw new Error(
        `Route "${routeSlug}" requires at least ${entry.minFileCount} file(s) for "${bucketLabel(entry)}".`,
      );
    }
  }

  return derivedAcceptedMimeTypesByFile;
}
