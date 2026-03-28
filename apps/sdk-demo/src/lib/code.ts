export const uploadCode = 
`import {
  createSiloUpload,
  FileRouter,
} from "@silo-storage/sdk-server";

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
  })
    .middleware(async ({ context }) => {
      if (!context?.userId) {
        throw new Error("Unauthorized");
      }
      return {
        userId: context.userId,
      };
    })
    .public(true) // either this, or pass in a async function
    .expires({ ttl: "2 minutes" }) // same here
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

`;

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