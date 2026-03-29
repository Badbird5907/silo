export const uploadCode = 
`import type { FileRouter } from "@silo-storage/sdk-server";
import { createSiloUpload } from "@silo-storage/sdk-server";

interface UploadContext {
  userId: string | null;
}

const f = createSiloUpload<Request, UploadContext>();

export const fileRouter = {
  imageUploader: f({
    image: {
      maxFileSize: "5MB",
      maxFileCount: 2,
    }
  }).middleware(({ context }) => {
    if (!context.userId) {
      throw new Error("Unauthorized");
    }
    return {
      userId: context.userId,
    };
  })
  .expires("2 minutes") // you can also pass in a fn
  .public(false) // do we need a signed url to access?
  .onUploadComplete(({ metadata, file }) => {
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