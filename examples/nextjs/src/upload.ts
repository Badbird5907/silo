import { createSiloUpload, FileRouter } from "@silo-storage/sdk-server";
import { z } from "zod";

type UploadContext = {
  userId: string | null;
};

const f = createSiloUpload<Request, UploadContext>();

export const fileRouter = {
  imageOrVideoUploader: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 4,
    },
    video: {
      maxFileSize: "256MB",
      maxFileCount: 1,
    },
    "application/x-msdownload": {
      maxFileSize: "512MB",
      maxFileCount: 1,
    },
  })
    .input(
      z.object({
        folder: z.enum(["avatars", "attachments"]).default("avatars"),
        public: z.boolean().optional(),
      }),
    )
    .middleware(async ({ context, input }) => {
      if (!context?.userId) {
        throw new Error("Unauthorized");
      }
      return {
        userId: context.userId,
        folder: input.folder,
      };
    })
    .public(({ input }) => input.public ?? true) // either this, or pass in a function
    .expires({ ttl: "2 minutes" }) // either this, or pass in a function
    .onUploadComplete(async ({ metadata, file }) => {
      console.info("[onUploadComplete]", { metadata, file });
      return {
        uploadedBy: metadata.userId,
        folder: metadata.folder,
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
        fileName: file.fileName,
        size: file.size,
        mimeType: file.mimeType,
      };
    }),
} satisfies FileRouter<Request, UploadContext>;

export type AppFileRouter = typeof fileRouter;
