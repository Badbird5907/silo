import type { FileRouterInputKey } from "@silo-storage/mime-types";
import type { UploadFileInput } from "@silo-storage/sdk-core";

import {
  isAllowedFileType,
  isMimeTypeAllowedByKey,
  lookupMimeTypeFromFile,
} from "@silo-storage/mime-types";

import type { SiloRouteConfig, SiloRouteFileConstraint } from "./types";
import { parseMaxFileSizeBytes } from "./normalize";

function normalizeMimeTypeValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.split(";")[0]?.trim().toLowerCase() ?? undefined;
}

function routeKeyMatchRank(routeKey: FileRouterInputKey): number {
  if (routeKey === "blob") return 1;
  if (isAllowedFileType(routeKey)) return 2;
  return 3;
}

export function enforceRouteConfigConstraints(
  routeSlug: string,
  routeConfig: SiloRouteConfig,
  files: UploadFileInput[],
): (FileRouterInputKey[] | undefined)[] {
  const routeEntries = Object.entries(routeConfig) as [
    FileRouterInputKey,
    SiloRouteFileConstraint,
  ][];
  if (routeEntries.length === 0) {
    return files.map(() => undefined);
  }

  const parsedEntries = routeEntries.map(([routeKey, constraint]) => ({
    routeKey,
    constraint,
    maxFileSizeBytes: constraint.maxFileSize
      ? parseMaxFileSizeBytes(constraint.maxFileSize)
      : undefined,
  }));

  const countByRouteKey = new Map<string, number>();
  const derivedAcceptedMimeTypesByFile: (FileRouterInputKey[] | undefined)[] =
    [];
  for (const entry of parsedEntries) {
    countByRouteKey.set(entry.routeKey, 0);
  }

  for (const file of files) {
    if (!Number.isFinite(file.size) || file.size < 0) {
      throw new Error(
        `Route "${routeSlug}" received invalid file size for "${file.fileName}".`,
      );
    }

    const resolvedMimeType = lookupMimeTypeFromFile(
      file.fileName,
      file.mimeType,
    );

    const matchingEntries = parsedEntries.filter((entry) => {
      if (!resolvedMimeType) {
        return entry.routeKey === "blob";
      }
      return isMimeTypeAllowedByKey(resolvedMimeType, entry.routeKey);
    });

    let matchedEntry = matchingEntries[0];
    if (matchingEntries.length > 1) {
      const highestRank = Math.max(
        ...matchingEntries.map((entry) => routeKeyMatchRank(entry.routeKey)),
      );
      const highestRankEntries = matchingEntries.filter(
        (entry) => routeKeyMatchRank(entry.routeKey) === highestRank,
      );

      if (highestRankEntries.length > 1) {
        throw new Error(
          `Route "${routeSlug}" file "${file.fileName}" matches multiple file type buckets. Remove overlapping file type keys.`,
        );
      }

      matchedEntry = highestRankEntries[0];
    }

    if (!matchedEntry) {
      const normalizedProvidedMimeType = normalizeMimeTypeValue(file.mimeType);
      if (!resolvedMimeType) {
        throw new Error(
          `Route "${routeSlug}" does not allow file "${file.fileName}" because its MIME type could not be determined from browser type or filename extension.`,
        );
      }
      throw new Error(
        `Route "${routeSlug}" does not allow MIME type "${normalizedProvidedMimeType ?? resolvedMimeType}" for "${file.fileName}".`,
      );
    }

    const count = (countByRouteKey.get(matchedEntry.routeKey) ?? 0) + 1;
    countByRouteKey.set(matchedEntry.routeKey, count);

    if (
      matchedEntry.constraint.maxFileCount !== undefined &&
      count > matchedEntry.constraint.maxFileCount
    ) {
      throw new Error(
        `Route "${routeSlug}" allows at most ${matchedEntry.constraint.maxFileCount} file(s) for "${matchedEntry.routeKey}".`,
      );
    }

    if (
      matchedEntry.maxFileSizeBytes !== undefined &&
      file.size > matchedEntry.maxFileSizeBytes
    ) {
      throw new Error(
        `Route "${routeSlug}" file "${file.fileName}" exceeds maxFileSize ${matchedEntry.constraint.maxFileSize} for "${matchedEntry.routeKey}".`,
      );
    }

    derivedAcceptedMimeTypesByFile.push([matchedEntry.routeKey]);
  }

  for (const entry of parsedEntries) {
    const count = countByRouteKey.get(entry.routeKey) ?? 0;
    if (
      entry.constraint.minFileCount !== undefined &&
      count < entry.constraint.minFileCount
    ) {
      throw new Error(
        `Route "${routeSlug}" requires at least ${entry.constraint.minFileCount} file(s) for "${entry.routeKey}".`,
      );
    }
  }

  return derivedAcceptedMimeTypesByFile;
}
