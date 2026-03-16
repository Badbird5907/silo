import { createSiloUpload } from "@silo-storage/sdk-server";

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

const checkAuth = async (userId: string) => {
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return { userId, paid: true };
}
const dbCall = async (userId: string) => {
  return true;
}

export const fileRouter = {
  imageUploader: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 4,
    },
  })
    .middleware(async ({ context }) => {
      if (!context?.userId) {
        throw new Error("Unauthorized");
      }
      const { paid } = await checkAuth(context.userId);
      return {
        userId: context.userId,
        paid, // idk, if your user paid for something
      };
    })
    .public(true) // either this, or pass in a function
    .public(({ paid }) => { // return type from middleware
      return paid;
    })
    .expires("2 minutes") // either this, or pass in a function
    .expires(async ({ paid, userId }) => { // async works too
      if (paid) {
        const someDbCall = await dbCall(userId);
        if (someDbCall) {
          const date = new Date("2026-04-20T00:00:00.000Z");
          return date; // you can also do this
        }
        return null
      }
      return "2 minutes";
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.info("[onUploadComplete]", { metadata, file });
      return {
        uploadedBy: metadata.userId,
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
        fileName: file.fileName,
        size: file.size,
        mimeType: file.mimeType,
      } satisfies UploadCompleteResult;
    }),
};

export type AppFileRouter = typeof fileRouter;
