export const uploadCode = 
`import type { FileRouter } from "@silo-storage/sdk-server";
import { createSiloUpload } from "@silo-storage/sdk-server";
import { z } from "zod";

interface UploadContext {
  userId: string | null;
}

const f = createSiloUpload<Request, UploadContext>();

export const fileRouter = {
  imageUploader: f(
    z.object({ // input validation using zod (or any other Standard Schema lib)
      folder: z.enum(["avatars", "attachments"]).default("avatars"),
      kind: z.enum(["image", "binary"]).default("image"),
    }),
  ).middleware(({ context, input }) => {
    if (!context.userId) {
      throw new Error("Unauthorized");
    }
    return {
      userId: context.userId,
      folder: input.folder,
    };
  }).expects(({ input }) =>
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
    input.folder === "avatars" ? "2 minutes" : "10 minutes"
  ) // you can also pass in a fn
  .public(false) // do we need a signed url to access?
  .serveImage(({ input }) => input.folder === "avatars") // serve images from the image CDN (transformations etc)
  .onUploadComplete(({ metadata, file }) => {
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

export type AppFileRouter = typeof fileRouter;`;

// src/app/api/upload/route.ts
export const routeHandlerCode = 
`import { auth } from "my-auth-lib/server";
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";
import { createRouteHandler } from "@silo-storage/sdk-next";

import { fileRouter } from "@/upload";

const core = createSiloCoreFromToken({
  url: process.env.SILO_URL!,
  token: process.env.SILO_TOKEN!,
  cdnHost: process.env.NEXT_PUBLIC_SILO_CDN!,
});

export const { GET, POST } = createRouteHandler({
  router: fileRouter,
  core,
  resolveContext: async () => {
    // you can authenticate your user here
    // anything returned will be available in the upload context.
    const { userId } = await auth();
    return { userId };
  },
});
`
