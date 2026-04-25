import { z } from "zod";

export interface DeleteFileInput {
  projectId: string;
  environmentId?: string;
  fileKeyId?: string;
  accessKey?: string;
}

export interface DeleteFileLifecycleJobs {
  fileId: string;
  storageKey: string;
  claimed: number;
  completed: number;
  retried: number;
  dead: number;
}

export interface DeleteFileResult {
  httpStatus: number;
  message: string;
  projectId: string;
  projectName: string;
  environmentId: string;
  environmentName: string;
  fileKeyId: string;
  accessKey: string;
  lifecycleJobs: DeleteFileLifecycleJobs | null;
}

export const deleteFileResultSchema = z.object({
  message: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  environmentId: z.string(),
  environmentName: z.string(),
  fileKeyId: z.string(),
  accessKey: z.string(),
  lifecycleJobs: z
    .object({
      fileId: z.string(),
      storageKey: z.string(),
      claimed: z.number().int(),
      completed: z.number().int(),
      retried: z.number().int(),
      dead: z.number().int(),
    })
    .nullable(),
});

export function createDeleteFileRequestBody(
  input: DeleteFileInput,
  defaultEnvironmentId: string,
): Record<string, unknown> {
  if (!input.fileKeyId && !input.accessKey) {
    throw new Error("Provide fileKeyId or accessKey.");
  }

  return {
    projectId: input.projectId,
    environmentId: input.environmentId ?? defaultEnvironmentId,
    fileKeyId: input.fileKeyId,
    accessKey: input.accessKey,
  };
}
