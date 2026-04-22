import { auth } from "@clerk/nextjs/server";
import { createRouteHandler } from "@silo-storage/sdk-next";

import type { UploadContext } from "@/lib/sdk-demo/file-router";
import { fileRouter } from "@/lib/sdk-demo/file-router";
import { getSiloCore } from "@/lib/sdk-demo/silo";

export const { GET, POST } = createRouteHandler<UploadContext>({
  router: fileRouter,
  core: getSiloCore(),
  resolveContext: async (): Promise<UploadContext> => {
    const { userId } = await auth();
    return { userId };
  },
});