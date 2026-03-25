import { z } from "zod";

import type { RegisteredUploadFile } from "./types";

const registeredUploadFileSchema = z.object({
  fileKeyId: z.string(),
  accessKey: z.string(),
  status: z.string(),
});

const registerResponseBodySchema = z.object({
  success: z.literal(true),
  fileKeys: z.array(registeredUploadFileSchema),
  projectSlug: z.string().min(1),
});

export const listFilesResultSchema = z.object({
  files: z.array(
    z.object({
      id: z.string(),
      fileName: z.string(),
      accessKey: z.string(),
      projectId: z.string(),
      environmentId: z.string(),
      fileId: z.string().nullable(),
      status: z.enum(["pending", "completed", "failed"]),
      isPublic: z.boolean(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
      expiresAt: z.string().datetime().nullable(),
      uploadCompletedAt: z.string().datetime().nullable(),
      uploadFailedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
      hash: z.string().nullable(),
      mimeType: z.string().nullable(),
      size: z.number().nullable(),
      storageKey: z.string().nullable(),
    }),
  ),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    totalCount: z.number().int(),
    totalPages: z.number().int(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

export const fileDetailSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  accessKey: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  fileId: z.string().nullable(),
  status: z.enum(["pending", "completed", "failed"]),
  isPublic: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  callbackMetadata: z.record(z.string(), z.unknown()).nullable(),
  claimedHash: z.string().nullable(),
  claimedMimeType: z.string().nullable(),
  claimedSize: z.number().nullable(),
  expiresAt: z.string().datetime().nullable(),
  uploadCompletedAt: z.string().datetime().nullable(),
  uploadFailedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  file: z
    .object({
      id: z.string(),
      hash: z.string().nullable(),
      mimeType: z.string(),
      size: z.number(),
      storageKey: z.string(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
});

export function parseRegisterResponseBody(value: unknown): {
  success: true;
  fileKeys: RegisteredUploadFile[];
  projectSlug: string;
} {
  const parsed = registerResponseBodySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Unexpected register response shape: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
