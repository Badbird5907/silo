import type { FileRouter } from "../../../../../sdk/server/src/index";
import { createSiloUpload } from "../../../../../sdk/server/src/index";
import { z } from "zod";

export interface UploadContext {
  userId: string | null;
}

const f = createSiloUpload<Request, UploadContext>();

export const fileRouter = {
  imageUploader: f(
    z.object({
      folder: z.enum(["avatars", "attachments"]).default("avatars"),
      kind: z.enum(["image", "binary"]).default("image"),
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
    .expects(({ input }) =>
      input.kind === "binary"
        ? [
            {
              mimeTypes: ["application/xyz", "application/abc"],
              maxFileCount: 4,
              maxFileSize: "16MB",
            },
          ]
        : {
            image: {
              maxFileSize: "5MB",
              maxFileCount: 2,
              mimeTypes: ["image/png", "image/jpeg"],
            },
          },
    )
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
        str: "Done uploading"
      };
    })
} satisfies FileRouter<Request, UploadContext>;

export type AppFileRouter = typeof fileRouter;
