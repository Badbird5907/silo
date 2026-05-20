export interface UploadStateMetadata {
  uploadId: string;
  projectId: string;
  environmentId: string;
  fileKeyId: string;
  accessKey: string;
  fileName: string;
  size: number | null;
  offset: number;
  storageKey: string;
  multipartUploadId: string | null;
  parts: UploadStatePart[];
  isPublic: boolean;
  claimedHash?: string;
  claimedMimeType?: string;
  acceptedMimeTypes?: string[];
  claimedSize?: number;
  createdAt: string;
  expiresAt: string;
  clientIp?: string | null;
  metadata: Record<string, string>;
  rawMetadata?: string;
  callbackDeliveredAt?: string | null;
}

export interface UploadStatePart {
  partNumber: number;
  etag: string;
}

export interface UploadCreationParams {
  projectId: string;
  environmentId: string;
  fileKeyId: string;
  fileName: string;
  size: number | null;
  isPublic: boolean;
  claimedHash?: string;
  claimedMimeType?: string;
  claimedSize?: number;
  metadata?: Record<string, string>;
}

export type UploadProtocolVersion = "1.0.0";

export const UPLOAD_PROTOCOL_EXTENSIONS = [
  "creation",
  "creation-with-upload",
  "creation-defer-length",
  "expiration",
  "termination",
] as const;

export type UploadProtocolExtension =
  (typeof UPLOAD_PROTOCOL_EXTENSIONS)[number];
