import type { FileRouter } from "../../../../../sdk/server/src/index";
import { createSiloUpload } from "../../../../../sdk/server/src/index";
import { z } from "zod";

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
    .input(
      z.object({
        folder: z.enum(["avatars", "attachments"]).default("avatars"),
      }),
    )
    .middleware(({ context, input }) => {
      if (!context.userId) {
        throw new Error("Unauthorized");
      }

      return {
        userId: context.userId,
        folder: input.folder,
      };
    })
    .expires(({ input }) =>
      input.folder === "avatars" ? "2 minutes" : "10 minutes",
    )
    .public(false)
    .serveImage(({ input }) => input.folder === "avatars")
    .onUploadComplete(({ metadata, file }) => {
      console.info("[sdk-demo:onUploadComplete]", { metadata, file });

      return {
        test: "test",
        uploadedBy: metadata.userId,
        folder: metadata.folder,
      };
    })
} satisfies FileRouter<Request, UploadContext>;

export type AppFileRouter = typeof fileRouter;
