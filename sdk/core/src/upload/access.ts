import { z } from "zod";

export interface UpdateFileAccessInput {
  projectId: string;
  fileKeyId: string;
  environmentId?: string;
  isPublic: boolean;
  serveImage?: boolean;
}

export interface UpdateFileAccessResult {
  id: string;
  projectId: string;
  environmentId: string;
  accessKey: string;
  isPublic: boolean;
  serveImage: boolean | null;
}

export const updateFileAccessResultSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  accessKey: z.string(),
  isPublic: z.boolean(),
  serveImage: z.boolean().nullable(),
});

export function createUpdateFileAccessRequestBody(
  input: UpdateFileAccessInput,
  defaultEnvironmentId: string,
): Record<string, unknown> {
  return {
    projectId: input.projectId,
    environmentId: input.environmentId ?? defaultEnvironmentId,
    isPublic: input.isPublic,
    serveImage: input.serveImage,
  };
}
