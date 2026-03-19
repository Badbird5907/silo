import type { FileRouterInputKey } from "@silo-storage/mime-types";
import type { StringValue } from "ms";
import ms from "ms";

import { normalizeFileRouterInputKey } from "@silo-storage/mime-types";

import type {
  CoreFileExpiryInput,
  SiloFileExpiryInput,
  SiloRouteConfig,
  SiloRouteConfigInput,
  SiloRouteExpiryInput,
  SiloRouteFileConstraint,
  SiloRouteMimeTypesInput,
} from "./types";

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

    const normalized: SiloRouteConfig = {};
    for (const key of routeConfigInput) {
      const normalizedKey = normalizeFileRouterInputKey(key as string);
      normalized[normalizedKey] = {
        maxFileCount: 1,
      };
    }
    return normalized;
  }

  const normalized: SiloRouteConfig = {};
  const routeEntries = Object.entries(routeConfigInput) as [
    string,
    SiloRouteFileConstraint | undefined,
  ][];
  for (const [key, constraint] of routeEntries) {
    const normalizedKey = normalizeFileRouterInputKey(key);
    normalized[normalizedKey] = constraint ?? {};
  }
  return normalized;
}

export function normalizeResolvedMimeTypesInput(
  input: SiloRouteMimeTypesInput | undefined,
): FileRouterInputKey[] | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input === "string") {
    return [normalizeFileRouterInputKey(input)];
  }

  if (input.length === 0) {
    throw new Error("mimeTypes resolver cannot return an empty array");
  }

  const normalized = input.map((value) => normalizeFileRouterInputKey(value));
  return [...new Set(normalized)].sort();
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
