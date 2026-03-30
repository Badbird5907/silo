import { auth } from "@clerk/nextjs/server";
import { createRouteHandler } from "@silo-storage/sdk-next";

import { fileRouter } from "@/upload";
import { getSiloCore } from "@/lib/silo";

export const { GET, POST } = createRouteHandler({
  router: fileRouter,
  core: getSiloCore(),
  resolveContext: async () => {
    const { userId } = await auth();
    return { userId };
  },
});
