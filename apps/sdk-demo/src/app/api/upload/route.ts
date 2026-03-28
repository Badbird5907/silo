import { auth } from "@clerk/nextjs/server";
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";
import { createRouteHandler } from "@silo-storage/sdk-next";

import { fileRouter } from "@/upload";
import { env } from "@/env";

const core = createSiloCoreFromToken({
  url: env.SILO_URL,
  token: env.SILO_TOKEN,
});

export const { GET, POST } = createRouteHandler({
  router: fileRouter,
  core,
  resolveContext: async () => {
    const { userId } = await auth();
    return { userId };
  },
});
