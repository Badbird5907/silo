import { createSiloUpload, FileRouter } from "@silo-storage/sdk-server";

type UploadContext = {
  userId: string | null;
};

const f = createSiloUpload<Request, UploadContext>();

export type UploadCompleteResult = {
  uploadedBy: string;
  fileKeyId: string;
  accessKey: string;
  fileName: string;
  size: number;
  mimeType: string;
};

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
    .middleware(async ({ context }) => {
      if (!context?.userId) {
        throw new Error("Unauthorized");
      }
      return {
        userId: context.userId,
      };
    })
    .public(true) // either this, or pass in a function
    .expires({ ttl: "2 minutes" }) // either this, or pass in a function
    .onUploadComplete(async ({ metadata, file }) => {
      console.info("[onUploadComplete]", { metadata, file });
      return {
        uploadedBy: metadata.userId,
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
        fileName: file.fileName,
        size: file.size,
        mimeType: file.mimeType,
      };
    }),
} satisfies FileRouter<Request, UploadContext>;

export type AppFileRouter = typeof fileRouter;
