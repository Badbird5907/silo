import { fileTypeFromBuffer } from "file-type";

import {
  isMimeTypeAllowedByKey,
  lookupMimeTypeFromFile,
  normalizeFileRouterInputKey,
  stripMimeParameters,
} from "@silo-storage/mime-types";

const GENERIC_XML_MIME_TYPES = new Set(["application/xml", "text/xml"]);

function normalizeMimeType(mimeType: string, fileName?: string): string {
  const normalizedFileName = fileName?.trim();
  const lookedUp = normalizedFileName
    ? lookupMimeTypeFromFile(normalizedFileName, mimeType)
    : undefined;

  return lookedUp ?? stripMimeParameters(mimeType);
}

export function areMimeTypesEquivalent(
  mimeType1: string,
  mimeType2: string,
  fileName?: string,
): boolean {
  const normalizedMimeType1 = normalizeMimeType(mimeType1, fileName);
  const normalizedMimeType2 = normalizeMimeType(mimeType2, fileName);

  if (normalizedMimeType1 === normalizedMimeType2) {
    return true;
  }

  if (
    (normalizedMimeType1 === "image/svg+xml" &&
      GENERIC_XML_MIME_TYPES.has(normalizedMimeType2)) ||
    (normalizedMimeType2 === "image/svg+xml" &&
      GENERIC_XML_MIME_TYPES.has(normalizedMimeType1))
  ) {
    return true;
  }

  return false;
}

export async function detectMimeType(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  try {
    const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
    const result = await fileTypeFromBuffer(buffer);
    return result?.mime ?? "application/octet-stream";
  } catch (error) {
    console.error("MIME type detection failed:", error);
    return "application/octet-stream";
  }
}

export function isAllowedMimeType(
  mimeType: string,
  allowedTypes?: string[],
  fileName?: string,
): boolean {
  if (!allowedTypes || allowedTypes.length === 0) {
    return true;
  }

  const normalizedMimeType = normalizeMimeType(mimeType, fileName);

  for (const allowedType of allowedTypes) {
    let normalizedAllowedType;
    try {
      normalizedAllowedType = normalizeFileRouterInputKey(allowedType);
    } catch {
      return false;
    }

    if (isMimeTypeAllowedByKey(normalizedMimeType, normalizedAllowedType)) {
      return true;
    }
  }

  return false;
}
