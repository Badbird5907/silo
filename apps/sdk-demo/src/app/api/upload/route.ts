import { auth } from "@clerk/nextjs/server";
import { createRouteHandler } from "@silo-storage/sdk-next";

import { fileRouter } from "@/upload";
import { getSiloCore } from "@/lib/silo";

function getRouteHandler() {
  return createRouteHandler({
    router: fileRouter,
    core: getSiloCore(),
    resolveContext: async () => {
      const { userId } = await auth();
      return { userId };
    },
  });
}

export function GET() {
  const handler = getRouteHandler();
  return handler.GET();
}

export function POST(request: Request) {
  const handler = getRouteHandler();
  return handler.POST(request);
}
