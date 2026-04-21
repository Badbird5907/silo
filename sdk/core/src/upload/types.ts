import type { FileExpiryInput } from "./expiry";

export type UploadStrategy = "server" | "self";

export interface UploadCoreConfig {
  apiBaseUrl: string;
  apiKey: string;
  keyId?: string;
  environmentId: string;
  ingestServer: string;
  signingSecret?: string;
  uploadStrategy?: UploadStrategy;
  routeMode?: "subdomain" | "path";
  projectSlug?: string;
  callbackUrl?: string;
  fetch?: typeof fetch;
}

export interface GenerateDownloadUrlInput {
  accessKey: string;
  isPublic: boolean;
  fileKeyId?: string;
  fileName?: string;
  expiresIn?: number;
  projectSlug?: string;
}

export interface GenerateUrlFileLike {
  accessKey: string;
  fileName?: string;
  fileKeyId?: string;
  id?: string;
  isPublic?: boolean;
  serveImage?: boolean | null;
}

export interface GenerateUrlOverrideBase {
  sign?: boolean;
  fileName?: string;
  fileKeyId?: string;
  expiresIn?: number;
  projectSlug?: string;
}

export type GenerateDownloadUrlOverrides = GenerateUrlOverrideBase;

export interface GenerateImageUrlInput {
  accessKey: string;
  isPublic: boolean;
  serveImage?: boolean | null;
  fileKeyId?: string;
  fileName?: string;
  expiresIn?: number;
  projectSlug?: string;
  width?: number;
  quality?: number;
  format?: "auto" | "avif" | "webp" | "jpeg" | "jpg" | "png";
}

export interface GenerateImageUrlOverrides extends GenerateUrlOverrideBase {
  width?: number;
  quality?: number;
  format?: "auto" | "avif" | "webp" | "jpeg" | "jpg" | "png";
}

export interface UploadFileInput {
  fileName: string;
  size: number;
  accessKey?: string;
  fileKeyId?: string;
  hash?: string;
  mimeType?: string;
  acceptedMimeTypes?: string[]; // shorthand keys (image, video, ...) or exact MIME values
  isPublic?: boolean;
  serveImage?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RegisterUploadBatchInput {
  files: UploadFileInput[];
  uploadStrategy?: UploadStrategy;
  callbackMetadata?: Record<string, unknown>;
  callbackUrl?: string;
  dev?: boolean;
  expiresIn?: number;
  protocol?: "http" | "https";
  fileExpiry?: FileExpiryInput;
}

export interface PrepareUploadInput extends Omit<
  RegisterUploadBatchInput,
  "files"
> {
  file: UploadFileInput;
}

export interface ListFilesInput {
  projectId?: string;
  environmentId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "pending" | "completed" | "failed" | "deleted";
  metadata?: Record<string, unknown>;
}

export interface SiloFileSummary {
  id: string;
  fileName: string;
  accessKey: string;
  projectId: string;
  environmentId: string;
  fileId: string | null;
  status: "pending" | "completed" | "failed" | "deleted";
  isPublic: boolean;
  serveImage: boolean | null;
  metadata: Record<string, unknown> | null;
  expiresAt: string | null;
  uploadCompletedAt: string | null;
  uploadFailedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  hash: string | null;
  mimeType: string | null;
  size: number | null;
  storageKey: string | null;
}

export interface ListFilesResult {
  files: SiloFileSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface GetFileInput {
  projectId: string;
  fileKeyId: string;
  environmentId?: string;
}

export interface SiloFileDetail {
  id: string;
  fileName: string;
  accessKey: string;
  projectId: string;
  environmentId: string;
  fileId: string | null;
  status: "pending" | "completed" | "failed" | "deleted";
  isPublic: boolean;
  serveImage: boolean | null;
  metadata: Record<string, unknown> | null;
  expiresAt: string | null;
  uploadCompletedAt: string | null;
  uploadFailedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  callbackMetadata: Record<string, unknown> | null;
  claimedHash: string | null;
  claimedMimeType: string | null;
  claimedSize: number | null;
  updatedAt: string;
  file: {
    id: string;
    hash: string | null;
    mimeType: string;
    size: number;
    storageKey: string;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export interface PreparedUploadFile {
  fileKeyId: string;
  accessKey: string;
  uploadUrl: string;
  fileName: string;
  size: number;
  hash?: string;
  mimeType?: string;
  acceptedMimeTypes?: string[];
  isPublic?: boolean;
  serveImage?: boolean;
  metadata?: Record<string, unknown>;
  expiresAt: string;
}

export interface RegisteredUploadFile {
  fileKeyId: string;
  accessKey: string;
  status: string;
}

export interface ProductionUploadBatchResult {
  mode: "production";
  files: (PreparedUploadFile & { registration: RegisteredUploadFile | null })[];
  registerResponse: {
    success: true;
    fileKeys: RegisteredUploadFile[];
  };
}

export interface DevelopmentUploadBatchResult {
  mode: "development";
  files: PreparedUploadFile[];
  stream: ReadableStream<Uint8Array>;
  response: Response;
}

export type RegisterUploadBatchResult =
  | ProductionUploadBatchResult
  | DevelopmentUploadBatchResult;
