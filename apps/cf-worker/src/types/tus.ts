export interface TusUploadMetadata {
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
  parts: TusUploadPart[];
  isPublic: boolean;
  claimedHash?: string;
  claimedMimeType?: string;
  acceptedMimeTypes?: string[];
  claimedSize?: number;
  createdAt: string;
  expiresAt: string;
  metadata: Record<string, string>;
  rawMetadata?: string;
  callbackDeliveredAt?: string | null;
}

export interface TusUploadPart {
  partNumber: number;
  etag: string;
}

export interface TusCreationParams {
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

export type TusVersion = "1.0.0";

export const TUS_EXTENSIONS = [
  "creation",
  "creation-with-upload",
  "creation-defer-length",
  "expiration",
  "termination",
] as const;

export type TusExtension = (typeof TUS_EXTENSIONS)[number];
