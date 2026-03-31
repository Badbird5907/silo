import { z } from "zod";

export interface ProjectInfo {
  id: string;
  defaultFileAccess: "public" | "private";
  lifecycleState?: "active" | "deleting";
}

export interface FileKeyInfo {
  id: string;
  fileName: string;
  accessKey: string;
  projectId: string;
  environmentId: string;
  isPublic: boolean;
  expiresAt?: string | null;
  file: FileInfo;
}

export interface FileInfo {
  id: string;
  hash: string | null;
  mimeType: string;
  size: number;
  storageKey: string;
  adapterKey?: string;
}

export const fileInfoSchema = z
  .object({
    id: z.string(),
    hash: z.string().nullable(),
    mimeType: z.string(),
    size: z.number(),
    storageKey: z.string().optional(),
    adapterKey: z.string().optional(),
  })
  .transform((value) => {
    const storageKey = value.storageKey ?? value.adapterKey;
    if (!storageKey) {
      throw new Error("Missing storage key in file info");
    }

    return {
      ...value,
      storageKey,
    };
  });

export const fileKeyInfoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  accessKey: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  isPublic: z.boolean(),
  expiresAt: z.string().datetime().nullable().optional(),
  file: fileInfoSchema,
});

export interface UploadCallbackData {
  contractVersion?: 1;
  type: "upload-completed" | "upload-failed";
  data:
    | {
        environmentId: string;
        fileKeyId: string;
        accessKey: string;
        fileName: string;
        claimedSize: number;
        claimedHash: string | null;
        claimedMimeType: string | null;
        actualHash: string | null;
        actualMimeType: string;
        actualSize: number;
        storage?: {
          provider: string;
          objectKey: string;
        };
        adapterKey?: string;
        projectId: string;
        isPublic: boolean;
        metadata?: Record<string, unknown>;
      }
    | {
        environmentId: string;
        fileKeyId: string;
        projectId: string;
        error?: string;
      };
}

// export interface UploadCallbackResponse {
//   success: boolean;
//   fileKeyId?: string;
//   accessKey?: string;
//   fileId?: string;
//   status?: string;
// }

export const uploadCallbackResponseSchema = z.object({
  success: z.boolean(),
  fileKeyId: z.string().optional(),
  accessKey: z.string().optional(),
  fileId: z.string().optional(),
  status: z.string().optional(),
});
export type UploadCallbackResponse = z.infer<
  typeof uploadCallbackResponseSchema
>;

export const errorResponseSchema = z.object({
  error: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export interface SignatureVerificationRequest {
  keyId: string;
  signature: string;
  payload: {
    type: "upload";
    environmentId: string;
    fileKeyId: string;
    accessKey: string;
    fileName: string;
    size: string;
    keyId: string;
    hash?: string;
    mimeType?: string;
    acceptedMimeTypes?: string;
    expiresAt?: string;
    isPublic?: string;
  };
}

export interface SignatureVerificationResponse {
  valid: boolean;
  projectId?: string;
  environmentId?: string;
  fileKeyId?: string;
  accessKey?: string;
  fileName?: string;
  size?: number;
  claimedHash?: string | null;
  claimedMimeType?: string | null;
  acceptedMimeTypes?: string[] | null;
  isPublic?: boolean;
  error?: string;
}
