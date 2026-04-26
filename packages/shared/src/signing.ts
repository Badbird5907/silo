/**
 * Signed URL generation and verification for Cloudflare Worker
 *
 * This module provides functionality to generate and verify signed URLs
 * for upload and download operations through the Cloudflare Worker.
 *
 * IMPORTANT: The customer's server SDK generates signed URLs locally using their API key.
 * The browser never has access to the API key - it only receives pre-signed URLs from
 * the customer's server.
 *
 * SIGNING APPROACH:
 * Since API keys are stored as hashes on the server, we use a derived signing secret:
 * 1. signingSecret = HMAC(MASTER_SIGNING_SECRET, SHA256(apiKey))
 * 2. The customer SDK knows the full API key, so it computes SHA256(apiKey) locally
 * 3. The server has the keyHash stored, so it can derive the same signingSecret
 */

import { normalizeFileRouterInputKey } from "@silo-storage/mime-types";

export interface SignedUploadUrlParams {
  environmentId: string;
  fileKeyId: string; // client-generated, unique per environment
  accessKey: string; // caller-defined access key, unique per project
  fileName: string;
  size: number; // required for quota/validation
  hash?: string; // optional - if provided, worker validates against actual
  mimeType?: string; // optional - if provided, worker validates against actual
  expiresIn?: number; // seconds, optional - no expiry if omitted
  keyId: string; // Unique API key record id for server-side key lookup
  isPublic?: boolean; // optional - whether file should be publicly accessible
  /** Used when `workerDomain` has no scheme; ignored if `workerDomain` is `http://...` or `https://...`. */
  protocol?: "http" | "https";
  acceptedMimeTypes?: string[]; // optional - shorthand keys or exact MIME values
}

export interface SignedDownloadUrlParams {
  fileKeyId: string;
  accessKey: string;
  fileName?: string; // optional filename for content-disposition header
  expiresIn?: number; // seconds, default 3600 (1 hour)
}

export type ImageFormat = "auto" | "avif" | "webp" | "jpeg" | "jpg" | "png";
export type NormalizedImageFormat = Exclude<ImageFormat, "jpg">;

export interface SignedImageUrlParams {
  accessKey: string;
  fileName?: string;
  expiresIn?: number;
  width?: number;
  quality?: number;
  format?: ImageFormat;
}

export interface ParsedSignedUploadUrl {
  type: "upload";
  environmentId: string;
  fileKeyId: string;
  accessKey: string;
  fileName: string;
  size: number;
  hash?: string;
  mimeType?: string;
  expiresAt?: number;
  keyId: string;
  acceptedMimeTypes?: string[];
  signature: string;
}

export interface ParsedSignedDownloadUrl {
  type: "download";
  fileKeyId: string;
  accessKey: string;
  fileName?: string;
  expiresAt: number;
  signature: string;
}

export interface ParsedSignedImageUrl {
  type: "image";
  accessKey: string;
  fileName?: string;
  expiresAt: number;
  width?: number;
  quality?: number;
  format: NormalizedImageFormat;
  signature: string;
}

export type ParsedSignedUrl =
  | ParsedSignedUploadUrl
  | ParsedSignedDownloadUrl
  | ParsedSignedImageUrl;

export type ProjectRouteMode = "subdomain" | "path";

export interface SignedUrlRoutingOptions {
  routeMode?: ProjectRouteMode;
}

const PROJECT_ROUTE_PREFIX = "/p";
const IMAGE_FORMAT_VALUES = new Set<ImageFormat>([
  "auto",
  "avif",
  "webp",
  "jpeg",
  "jpg",
  "png",
]);

/**
 * Host (and optional port) plus scheme. If `workerDomain` includes `http://` or `https://`,
 * that scheme wins. For a bare host, uses `protocolOverride` when set, otherwise `https`.
 */
function resolveWorkerDomain(
  workerDomain: string,
  protocolOverride?: "http" | "https",
): { host: string; protocol: "http" | "https" } {
  let host = workerDomain.trim();
  const lower = host.toLowerCase();
  if (lower.startsWith("https://")) {
    host = host.slice("https://".length);
    return {
      host: host.replace(/\/+$/, ""),
      protocol: "https",
    };
  }
  if (lower.startsWith("http://")) {
    host = host.slice("http://".length);
    return {
      host: host.replace(/\/+$/, ""),
      protocol: "http",
    };
  }
  return {
    host: host.replace(/\/+$/, ""),
    protocol: protocolOverride ?? "https",
  };
}

function buildProjectScopedUrl(
  workerDomain: string,
  projectSlug: string,
  routePath: string,
  routing?: SignedUrlRoutingOptions,
  protocolOverride?: "http" | "https",
): URL {
  const { host, protocol } = resolveWorkerDomain(
    workerDomain,
    protocolOverride,
  );
  const normalizedPath = routePath.startsWith("/")
    ? routePath
    : `/${routePath}`;

  if (routing?.routeMode === "path") {
    return new URL(
      `${protocol}://${host}${PROJECT_ROUTE_PREFIX}/${projectSlug}${normalizedPath}`,
    );
  }

  return new URL(
    `${protocol}://${projectSlug}.${host}${normalizedPath}`,
  );
}

export function normalizeAcceptedMimeTypePattern(pattern: string): string {
  return normalizeFileRouterInputKey(pattern);
}

export function normalizeAcceptedMimeTypePatterns(
  patterns: string[],
): string[] {
  if (patterns.length === 0) {
    throw new Error("acceptedMimeTypes cannot be an empty array");
  }

  const normalized = patterns.map(normalizeAcceptedMimeTypePattern);
  return [...new Set(normalized)].sort();
}

export function serializeAcceptedMimeTypePatterns(
  patterns: string[] | undefined,
): string | undefined {
  if (!patterns) return undefined;
  const normalized = normalizeAcceptedMimeTypePatterns(patterns);
  return normalized.join(",");
}

export function parseAcceptedMimeTypePatterns(
  value: string | undefined | null,
): string[] | undefined {
  if (!value) return undefined;

  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error("acceptedMimeTypes cannot be empty");
  }

  return normalizeAcceptedMimeTypePatterns(parts);
}

export function normalizeImageWidth(
  value: string | number | undefined | null,
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized =
    typeof value === "number" ? value : Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(normalized) || normalized <= 0 || normalized > 10000) {
    throw new Error(`Invalid image width "${value}"`);
  }

  return normalized;
}

export function normalizeImageQuality(
  value: string | number | undefined | null,
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized =
    typeof value === "number" ? value : Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 100) {
    throw new Error(`Invalid image quality "${value}"`);
  }

  return normalized;
}

export function normalizeImageFormat(
  value: string | undefined | null,
): NormalizedImageFormat {
  const normalized = value?.trim().toLowerCase() ?? "auto";
  if (!IMAGE_FORMAT_VALUES.has(normalized as ImageFormat)) {
    throw new Error(`Invalid image format "${value}"`);
  }
  return normalized === "jpg" ? "jpeg" : (normalized as NormalizedImageFormat);
}

/**
 * Derive a signing secret from an API key and master signing secret.
 * This allows the server to verify signatures without storing the original API key.
 *
 * @param apiKey - The full API key (e.g., "sk-silo-xxxxx...")
 * @param masterSigningSecret - The server's SIGNING_SECRET environment variable
 * @returns The derived signing secret to use for HMAC signatures
 */
export async function deriveSigningSecret(
  apiKey: string,
  masterSigningSecret: string,
): Promise<string> {
  const keyHash = await hashString(apiKey);
  return deriveSigningSecretFromHash(keyHash, masterSigningSecret);
}

/**
 * Derive a signing secret from an API key hash and master signing secret.
 * Used by the server when it only has access to the keyHash.
 */
export async function deriveSigningSecretFromHash(
  keyHash: string,
  masterSigningSecret: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterSigningSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const derivedBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(keyHash),
  );

  return Array.from(new Uint8Array(derivedBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash a string using SHA-256 (used for API key hashing)
 */
export async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a signed upload URL
 *
 * This is called by the customer's server SDK to create a pre-signed URL
 * that the browser can use to upload directly to the Cloudflare Worker.
 *
 * @param workerDomain - The worker domain (e.g., "files.evanyu.dev")
 * @param projectSlug - The project slug (e.g., "myproject-k9x2m7")
 * @param params - Upload parameters
 * @param apiKey - The full API key (will be used to derive signing secret)
 * @param masterSigningSecret - The SIGNING_SECRET from environment
 *
 * URL format: POST https://{projectSlug}.{workerDomain}/ingest/tus?fileName=...&size=...&sig=...
 */
export async function generateSignedUploadUrl(
  workerDomain: string,
  projectSlug: string,
  params: SignedUploadUrlParams,
  apiKey: string,
  masterSigningSecret: string,
  routing?: SignedUrlRoutingOptions,
): Promise<string> {
  const signingSecret = await deriveSigningSecret(apiKey, masterSigningSecret);

  const payload: Record<string, string> = {
    type: "upload",
    environmentId: params.environmentId,
    fileKeyId: params.fileKeyId,
    accessKey: params.accessKey,
    fileName: params.fileName,
    size: params.size.toString(),
    keyId: params.keyId,
  };

  if (params.hash) {
    payload.hash = params.hash;
  }
  if (params.mimeType) {
    payload.mimeType = params.mimeType;
  }
  if (params.expiresIn !== undefined) {
    const expiresAt = Math.floor(Date.now() / 1000) + params.expiresIn;
    payload.expiresAt = expiresAt.toString();
  }
  if (params.isPublic !== undefined) {
    payload.isPublic = params.isPublic.toString();
  }
  const acceptedMimeTypes = serializeAcceptedMimeTypePatterns(
    params.acceptedMimeTypes,
  );
  if (acceptedMimeTypes) {
    payload.acceptedMimeTypes = acceptedMimeTypes;
  }

  const signature = await createSignature(payload, signingSecret);

  const url = buildProjectScopedUrl(
    workerDomain,
    projectSlug,
    "/ingest/tus",
    routing,
    params.protocol,
  );
  Object.entries(payload).forEach(([key, value]) => {
    if (key !== "type") {
      url.searchParams.set(key, value);
    }
  });
  url.searchParams.set("sig", signature);

  return url.toString();
}

/**
 * Generate a signed upload URL using a pre-derived signing secret.
 *
 * Use this when you already have the signingSecret (returned at API key creation time)
 * and want to self-sign upload URLs from your server without calling the /upload endpoint.
 */
export async function generateSignedUploadUrlWithSecret(
  workerDomain: string,
  projectSlug: string,
  params: SignedUploadUrlParams,
  signingSecret: string,
  routing?: SignedUrlRoutingOptions,
): Promise<string> {
  const payload: Record<string, string> = {
    type: "upload",
    environmentId: params.environmentId,
    fileKeyId: params.fileKeyId,
    accessKey: params.accessKey,
    fileName: params.fileName,
    size: params.size.toString(),
    keyId: params.keyId,
  };

  if (params.hash) {
    payload.hash = params.hash;
  }
  if (params.mimeType) {
    payload.mimeType = params.mimeType;
  }
  if (params.expiresIn !== undefined) {
    const expiresAt = Math.floor(Date.now() / 1000) + params.expiresIn;
    payload.expiresAt = expiresAt.toString();
  }
  if (params.isPublic !== undefined) {
    payload.isPublic = params.isPublic.toString();
  }
  const acceptedMimeTypes = serializeAcceptedMimeTypePatterns(
    params.acceptedMimeTypes,
  );
  if (acceptedMimeTypes) {
    payload.acceptedMimeTypes = acceptedMimeTypes;
  }

  const signature = await createSignature(payload, signingSecret);

  const url = buildProjectScopedUrl(
    workerDomain,
    projectSlug,
    "/ingest/tus",
    routing,
    params.protocol,
  );
  Object.entries(payload).forEach(([key, value]) => {
    if (key !== "type") {
      url.searchParams.set(key, value);
    }
  });
  url.searchParams.set("sig", signature);

  return url.toString();
}

/**
 * Generate a signed upload URL using a stored key hash instead of the full API key.
 *
 * Used by server-side dashboard routes that authenticate via session and look up
 * an API key record from the database (where only the hash is stored).
 */
export async function generateSignedUploadUrlFromHash(
  workerDomain: string,
  projectSlug: string,
  params: SignedUploadUrlParams,
  keyHash: string,
  masterSigningSecret: string,
  routing?: SignedUrlRoutingOptions,
): Promise<string> {
  const signingSecret = await deriveSigningSecretFromHash(
    keyHash,
    masterSigningSecret,
  );

  return generateSignedUploadUrlWithSecret(
    workerDomain,
    projectSlug,
    params,
    signingSecret,
    routing,
  );
}

/**
 * Generate a signed download URL
 *
 * @param workerDomain - The worker domain (e.g., "files.evanyu.dev")
 * @param projectSlug - The project slug (e.g., "myproject-k9x2m7")
 * @param params - Download parameters
 * @param signingSecret - The signing secret
 *
 * URL format for private files: https://{projectSlug}.{workerDomain}/f/{accessKey}?sig=...&expiresAt=...
 * URL format for public files: https://{projectSlug}.{workerDomain}/f/{accessKey}
 */
export async function generateSignedDownloadUrl(
  workerDomain: string,
  projectSlug: string,
  params: SignedDownloadUrlParams,
  signingSecret: string,
  routing?: SignedUrlRoutingOptions,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + (params.expiresIn ?? 3600);

  const payload: Record<string, string> = {
    accessKey: params.accessKey,
    expiresAt: expiresAt.toString(),
  };

  const signature = await createSignature(payload, signingSecret);

  const url = buildProjectScopedUrl(
    workerDomain,
    projectSlug,
    `/f/${params.accessKey}`,
    routing,
  );
  url.searchParams.set("expiresAt", expiresAt.toString());
  url.searchParams.set("sig", signature);

  if (params.fileName) {
    url.searchParams.set("fileName", params.fileName);
  }

  return url.toString();
}

/**
 * Generate a public download URL (no signature required)
 *
 * @param workerDomain - The worker domain (e.g., "files.evanyu.dev")
 * @param projectSlug - The project slug (e.g., "myproject-k9x2m7")
 * @param accessKey - The file access key
 * @param fileName - Optional filename for content-disposition
 *
 * URL format: https://{projectSlug}.{workerDomain}/f/{accessKey}
 */
export function generatePublicDownloadUrl(
  workerDomain: string,
  projectSlug: string,
  accessKey: string,
  fileName?: string,
  routing?: SignedUrlRoutingOptions,
): string {
  const url = buildProjectScopedUrl(
    workerDomain,
    projectSlug,
    `/f/${accessKey}`,
    routing,
  );

  if (fileName) {
    url.searchParams.set("fileName", fileName);
  }

  return url.toString();
}

export async function generateSignedImageUrl(
  workerDomain: string,
  projectSlug: string,
  params: SignedImageUrlParams,
  signingSecret: string,
  routing?: SignedUrlRoutingOptions,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + (params.expiresIn ?? 3600);
  const width = normalizeImageWidth(params.width);
  const quality = normalizeImageQuality(params.quality);
  const format = normalizeImageFormat(params.format);

  const payload: Record<string, string> = {
    type: "image",
    accessKey: params.accessKey,
    expiresAt: expiresAt.toString(),
    fmt: format,
  };
  if (width !== undefined) {
    payload.w = width.toString();
  }
  if (quality !== undefined) {
    payload.q = quality.toString();
  }

  const signature = await createSignature(payload, signingSecret);

  const url = buildProjectScopedUrl(
    workerDomain,
    projectSlug,
    `/i/${params.accessKey}`,
    routing,
  );
  url.searchParams.set("expiresAt", expiresAt.toString());
  url.searchParams.set("sig", signature);
  url.searchParams.set("fmt", format);
  if (width !== undefined) {
    url.searchParams.set("w", width.toString());
  }
  if (quality !== undefined) {
    url.searchParams.set("q", quality.toString());
  }

  if (params.fileName) {
    url.searchParams.set("fileName", params.fileName);
  }

  return url.toString();
}

export function generatePublicImageUrl(
  workerDomain: string,
  projectSlug: string,
  accessKey: string,
  options?: {
    fileName?: string;
    width?: number;
    quality?: number;
    format?: ImageFormat;
  },
  routing?: SignedUrlRoutingOptions,
): string {
  const width = normalizeImageWidth(options?.width);
  const quality = normalizeImageQuality(options?.quality);
  const format = normalizeImageFormat(options?.format);
  const url = buildProjectScopedUrl(
    workerDomain,
    projectSlug,
    `/i/${accessKey}`,
    routing,
  );

  url.searchParams.set("fmt", format);
  if (width !== undefined) {
    url.searchParams.set("w", width.toString());
  }
  if (quality !== undefined) {
    url.searchParams.set("q", quality.toString());
  }

  if (options?.fileName) {
    url.searchParams.set("fileName", options.fileName);
  }

  return url.toString();
}

/**
 * Verify a signed upload URL and extract its parameters
 *
 * This is called by the Cloudflare Worker to validate incoming upload requests.
 * The worker must fetch key metadata from the server using the unique keyId.
 */
export async function verifySignedUploadUrl(
  url: string,
  apiKeySecret: string,
): Promise<ParsedSignedUploadUrl> {
  const urlObj = new URL(url);
  const signature = urlObj.searchParams.get("sig");

  if (!signature) {
    throw new Error("Missing signature in URL");
  }

  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  if (pathParts.length < 3 || pathParts[0] !== "upload") {
    throw new Error("Invalid upload URL path");
  }
  const environmentId = pathParts[1];
  const fileKeyId = pathParts[2];

  if (!environmentId || !fileKeyId) {
    throw new Error("Missing environmentId or fileKeyId in URL path");
  }

  const fileName = urlObj.searchParams.get("fileName");
  const sizeStr = urlObj.searchParams.get("size");
  const keyId = urlObj.searchParams.get("keyId");
  const accessKey = urlObj.searchParams.get("accessKey");
  const hash = urlObj.searchParams.get("hash");
  const mimeType = urlObj.searchParams.get("mimeType");
  const expiresAtStr = urlObj.searchParams.get("expiresAt");
  const acceptedMimeTypesParam = urlObj.searchParams.get("acceptedMimeTypes");
  const acceptedMimeTypes = parseAcceptedMimeTypePatterns(
    acceptedMimeTypesParam,
  );

  if (!fileName || !sizeStr || !keyId || !accessKey) {
    throw new Error(
      "Missing required parameters: fileName, size, keyId, or accessKey",
    );
  }

  const size = parseInt(sizeStr, 10);
  if (isNaN(size) || size <= 0) {
    throw new Error("Invalid size parameter");
  }

  let expiresAt: number | undefined;
  if (expiresAtStr) {
    expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt)) {
      throw new Error("Invalid expiresAt parameter");
    }
    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) {
      throw new Error("Signed URL has expired");
    }
  }

  const payload: Record<string, string> = {
    type: "upload",
    environmentId,
    fileKeyId,
    accessKey,
    fileName,
    size: sizeStr,
    keyId,
  };
  if (hash) payload.hash = hash;
  if (mimeType) payload.mimeType = mimeType;
  if (expiresAtStr) payload.expiresAt = expiresAtStr;
  if (acceptedMimeTypes) {
    payload.acceptedMimeTypes = acceptedMimeTypes.join(",");
  }

  const expectedSignature = await createSignature(payload, apiKeySecret);
  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Error("Invalid signature");
  }

  return {
    type: "upload",
    environmentId,
    fileKeyId,
    accessKey,
    fileName,
    size,
    hash: hash ?? undefined,
    mimeType: mimeType ?? undefined,
    expiresAt,
    keyId,
    acceptedMimeTypes,
    signature,
  };
}

/**
 * Verify a signed download URL and extract its parameters
 */
export async function verifySignedDownloadUrl(
  url: string,
  signingSecret: string,
): Promise<ParsedSignedDownloadUrl> {
  const urlObj = new URL(url);
  const signature = urlObj.searchParams.get("sig");

  if (!signature) {
    throw new Error("Missing signature in URL");
  }

  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  if (pathParts.length < 2 || pathParts[0] !== "download") {
    throw new Error("Invalid download URL path");
  }
  const fileKeyId = pathParts[1];

  if (!fileKeyId) {
    throw new Error("Missing fileKeyId in URL path");
  }

  const accessKey = urlObj.searchParams.get("accessKey");
  const expiresAtStr = urlObj.searchParams.get("expiresAt");
  const fileName = urlObj.searchParams.get("fileName");

  if (!accessKey || !expiresAtStr) {
    throw new Error("Missing required parameters: accessKey or expiresAt");
  }

  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt)) {
    throw new Error("Invalid expiresAt parameter");
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > expiresAt) {
    throw new Error("Signed URL has expired");
  }

  const payload: Record<string, string> = {
    type: "download",
    fileKeyId,
    accessKey,
    expiresAt: expiresAtStr,
  };
  if (fileName) payload.fileName = fileName;

  const expectedSignature = await createSignature(payload, signingSecret);
  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Error("Invalid signature");
  }

  return {
    type: "download",
    fileKeyId,
    accessKey,
    fileName: fileName ?? undefined,
    expiresAt,
    signature,
  };
}

/**
 * Create HMAC-SHA256 signature for the given payload
 */
async function createSignature(
  payload: Record<string, string>,
  secret: string,
): Promise<string> {
  const sortedKeys = Object.keys(payload).sort();
  const message = sortedKeys.map((key) => `${key}=${payload[key]}`).join("&");

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    messageData,
  );

  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// crypto.subtle does not have timingSafeEqual
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// Export createSignature for use in SDK
export { createSignature };
