import type { AllowedFileType } from "@silo-storage/mime-types";
import type { StringValue } from "ms";
import ms from "ms";

import {
  isAllowedFileType,
  isMimeTypeAllowedByKey,
  stripMimeParameters,
} from "@silo-storage/mime-types";

import type {
  CoreFileExpiryInput,
  SiloFileExpiryInput,
  SiloRouteConfig,
  SiloRouteConfigInput,
  SiloRouteExpectBucket,
  SiloRouteExpectObject,
  SiloRouteExpiryInput,
  SiloRouteFileConstraint,
  SiloRouteTypeKey,
} from "./types";

const mimeTypePattern = /^[^/\s]+\/[^/\s]+$/;

function isBroadRouteTypeKey(value: string): value is AllowedFileType {
  return isAllowedFileType(value);
}

export function normalizeRouteTypeKey(value: string): SiloRouteTypeKey {
  const normalized = stripMimeParameters(value);

  if (isBroadRouteTypeKey(normalized)) {
    return normalized;
  }

  if (!mimeTypePattern.test(normalized)) {
    throw new Error(
      `Invalid file type key "${value}". Expected one of image, video, audio, pdf, text, blob or an exact MIME type like "application/pdf".`,
    );
  }

  return normalized as SiloRouteTypeKey;
}

function normalizeExactMimeTypesInput(
  input: string | readonly string[],
  label: string,
): string[] {
  const values = typeof input === "string" ? [input] : [...input];
  if (values.length === 0) {
    throw new Error(`${label} cannot be an empty array`);
  }

  const normalized = values.map((value) => {
    const mimeType = stripMimeParameters(value);
    if (!mimeTypePattern.test(mimeType)) {
      throw new Error(
        `${label} contains invalid MIME type "${value}". Expected a value like "image/png".`,
      );
    }
    return mimeType;
  });

  return [...new Set(normalized)].sort();
}

function normalizeConstraintBase<TConstraint extends SiloRouteFileConstraint>(
  constraint: TConstraint,
) {
  return {
    maxFileSize: constraint.maxFileSize,
    minFileCount: constraint.minFileCount,
    maxFileCount: constraint.maxFileCount,
  };
}

function normalizeObjectConstraint(
  routeKey: SiloRouteTypeKey,
  constraint: SiloRouteFileConstraint | undefined,
) {
  const normalizedConstraint = constraint ?? {};
  const normalizedBucket = {
    type: routeKey,
    ...normalizeConstraintBase(normalizedConstraint),
  };

  if (normalizedConstraint.mimeTypes === undefined) {
    return normalizedBucket;
  }

  if (routeKey === "blob") {
    throw new Error(
      `Route config bucket "${routeKey}" cannot declare mimeTypes. Use an array bucket with mimeTypes instead.`,
    );
  }

  if (!isBroadRouteTypeKey(routeKey)) {
    throw new Error(
      `Route config bucket "${routeKey}" cannot declare mimeTypes because it already names an exact MIME type.`,
    );
  }

  const mimeTypes = normalizeExactMimeTypesInput(
    normalizedConstraint.mimeTypes,
    `Route config bucket "${routeKey}" mimeTypes`,
  );
  for (const mimeType of mimeTypes) {
    if (!isMimeTypeAllowedByKey(mimeType, routeKey)) {
      throw new Error(
        `Route config bucket "${routeKey}" cannot include MIME type "${mimeType}" because it does not belong to "${routeKey}".`,
      );
    }
  }

  return {
    ...normalizedBucket,
    mimeTypes,
  };
}

function normalizeBucketInput(
  bucket: SiloRouteExpectBucket,
  index: number,
) {
  const label = `Route config bucket at index ${index}`;
  if (bucket.type === undefined && bucket.mimeTypes === undefined) {
    throw new Error(`${label} must define at least one of "type" or "mimeTypes".`);
  }

  const normalizedType =
    bucket.type === undefined ? undefined : normalizeRouteTypeKey(bucket.type);
  const normalizedBucket = {
    type: normalizedType,
    ...normalizeConstraintBase(bucket),
  };

  if (bucket.mimeTypes === undefined) {
    return normalizedBucket;
  }

  if (normalizedType === "blob") {
    throw new Error(
      `${label} cannot combine type "blob" with mimeTypes. Omit "type" and use only mimeTypes for a custom MIME pool.`,
    );
  }

  if (normalizedType !== undefined && !isBroadRouteTypeKey(normalizedType)) {
    throw new Error(
      `${label} cannot declare mimeTypes because type "${normalizedType}" already names an exact MIME type.`,
    );
  }

  const mimeTypes = normalizeExactMimeTypesInput(
    bucket.mimeTypes,
    `${label} mimeTypes`,
  );
  if (normalizedType !== undefined) {
    for (const mimeType of mimeTypes) {
      if (!isMimeTypeAllowedByKey(mimeType, normalizedType)) {
        throw new Error(
          `${label} cannot include MIME type "${mimeType}" because it does not belong to "${normalizedType}".`,
        );
      }
    }
  }

  return {
    ...normalizedBucket,
    mimeTypes,
  };
}

function isStringArrayRouteConfigInput(
  routeConfigInput: readonly unknown[],
): routeConfigInput is readonly string[] {
  return routeConfigInput.every((value) => typeof value === "string");
}

function isBucketArrayRouteConfigInput(
  routeConfigInput: readonly unknown[],
): routeConfigInput is readonly SiloRouteExpectBucket[] {
  return routeConfigInput.every(
    (value) =>
      !!value && typeof value === "object" && !Array.isArray(value),
  );
}

export function normalizeFileExpiry(
  fileExpiry: SiloFileExpiryInput,
): CoreFileExpiryInput {
  if ("ttl" in fileExpiry) {
    if (typeof fileExpiry.ttl === "number") {
      if (!Number.isFinite(fileExpiry.ttl) || fileExpiry.ttl <= 0) {
        throw new Error("fileExpiry.ttl number must be a positive value");
      }
      return {
        ttlSeconds: Math.ceil(fileExpiry.ttl / 1000),
      };
    }

    const ttlMs = ms(fileExpiry.ttl as StringValue);
    if (typeof ttlMs !== "number" || ttlMs <= 0) {
      throw new Error(
        `Invalid fileExpiry.ttl value "${fileExpiry.ttl}". Example: "1 day" or "7d"`,
      );
    }

    return {
      ttlSeconds: Math.ceil(ttlMs / 1000),
    };
  }

  return {
    expiresAt: fileExpiry.expiresAt,
  };
}

export function normalizeRouteExpiryInput(
  fileExpiry: SiloRouteExpiryInput,
): CoreFileExpiryInput {
  if (fileExpiry === null) {
    return {
      expiresAt: null,
    };
  }

  if (typeof fileExpiry === "string" || fileExpiry instanceof Date) {
    if (fileExpiry instanceof Date) {
      return {
        expiresAt: fileExpiry,
      };
    }
    return normalizeFileExpiry({ ttl: fileExpiry });
  }

  return normalizeFileExpiry(fileExpiry);
}

export function normalizeRouteConfigInput(
  routeConfigInput: SiloRouteConfigInput,
): SiloRouteConfig {
  if (Array.isArray(routeConfigInput)) {
    if (routeConfigInput.length === 0) {
      throw new Error("Route config array cannot be empty");
    }

    if (isStringArrayRouteConfigInput(routeConfigInput)) {
      return routeConfigInput.map((key) => ({
        type: normalizeRouteTypeKey(key),
        maxFileCount: 1,
      }));
    }

    if (isBucketArrayRouteConfigInput(routeConfigInput)) {
      const bucketArray = routeConfigInput as readonly SiloRouteExpectBucket[];
      return bucketArray.map((bucket, index) => normalizeBucketInput(bucket, index));
    }

    throw new Error(
      "Route config array must contain either only string shorthand keys or only bucket objects.",
    );
  }

  const normalized: ReturnType<typeof normalizeObjectConstraint>[] = [];
  const routeEntries = Object.entries(routeConfigInput as SiloRouteExpectObject) as [
    string,
    SiloRouteFileConstraint | undefined,
  ][];
  for (const [key, constraint] of routeEntries) {
    normalized.push(
      normalizeObjectConstraint(normalizeRouteTypeKey(key), constraint),
    );
  }
  return normalized;
}

export function parseMaxFileSizeBytes(maxFileSize: string): number {
  const trimmed = maxFileSize.trim();
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)$/i.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid maxFileSize value "${maxFileSize}". Expected formats like "2MB" or "512KB".`,
    );
  }

  const sizeRaw = match[1];
  const unitRaw = match[2];
  if (!sizeRaw || !unitRaw) {
    throw new Error(`Invalid maxFileSize value "${maxFileSize}".`);
  }

  const size = Number.parseFloat(sizeRaw);
  const unit = unitRaw.toLowerCase();
  const multiplier =
    unit === "b"
      ? 1
      : unit === "kb"
        ? 1024
        : unit === "mb"
          ? 1024 ** 2
          : unit === "gb"
            ? 1024 ** 3
            : 1024 ** 4;

  return Math.floor(size * multiplier);
}
