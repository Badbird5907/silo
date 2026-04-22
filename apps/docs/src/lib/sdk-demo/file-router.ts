import type { FileRouter } from "@silo-storage/sdk-server";
import { createSiloUpload } from "@silo-storage/sdk-server";

export interface UploadContext {
  userId: string | null;
}

const f = createSiloUpload<Request, UploadContext>();

export const fileRouter = {
  imageUploader: f({
    image: {
      maxFileSize: "5MB",
      maxFileCount: 2,
    },
  })
    .middleware(({ context }) => {
      if (!context.userId) {
        throw new Error("Unauthorized");
      }

      return {
        userId: context.userId,
      };
    })
    .expires("2 minutes")
    .public(false)
    .serveImage(true)
    .onUploadComplete(({ metadata, file }) => {
      console.info("[sdk-demo:onUploadComplete]", { metadata, file });

      return {
        uploadedBy: metadata.userId,
      };
    })
} satisfies FileRouter<Request, UploadContext>;

export type AppFileRouter = typeof fileRouter;
