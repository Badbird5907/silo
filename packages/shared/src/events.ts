export const uploadEventTypes = ["upload.completed", "upload.failed"] as const;
export type UploadEventType = (typeof uploadEventTypes)[number];

export type FileKeyMetadata = Record<string, unknown>;

export function normalizeFileKeyMetadata(value: unknown): FileKeyMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as FileKeyMetadata;
}

export interface UploadCompletedEventData {
  environmentId: string;
  projectId: string;
  fileKeyId: string;
  accessKey: string;
  fileId: string;
  fileName: string;
  hash: string | null;
  mimeType: string;
  size: number;
  expiresAt: string | null;
  metadata: FileKeyMetadata;
}

export interface UploadFailedEventData {
  environmentId: string;
  projectId: string;
  fileKeyId: string;
  metadata: FileKeyMetadata;
  error: string;
}

export interface UploadEventDataByType {
  "upload.completed": UploadCompletedEventData;
  "upload.failed": UploadFailedEventData;
}

export interface UploadEventEnvelope<
  TType extends UploadEventType = UploadEventType,
> {
  id: string;
  type: TType;
  version: 1;
  occurredAt: string;
  data: UploadEventDataByType[TType];
}

export function createUploadEventEnvelope<TType extends UploadEventType>(
  type: TType,
  data: UploadEventDataByType[TType],
  id: string = crypto.randomUUID(),
): UploadEventEnvelope<TType> {
  return {
    id,
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    data,
  };
}
