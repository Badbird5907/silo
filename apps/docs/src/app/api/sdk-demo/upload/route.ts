import { auth } from "@clerk/nextjs/server";
import { createFetchRouteHandler } from "../../../../../../../sdk/server/src/index";

import type { UploadContext } from "@/lib/sdk-demo/file-router";
import { fileRouter } from "@/lib/sdk-demo/file-router";
import { getSiloCore } from "@/lib/sdk-demo/silo";

export const { GET, POST } = createFetchRouteHandler<UploadContext>({
  router: fileRouter,
  core: getSiloCore(),
  // completionTransport: "callback-url",
  // callbackUrl: "http://localhost:8345/api/sdk-demo/upload",
  resolveContext: async (): Promise<UploadContext> => {
    const { userId } = await auth();
    return { userId };
  },
});
