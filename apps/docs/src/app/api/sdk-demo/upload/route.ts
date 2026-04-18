import { auth } from "@clerk/nextjs/server";
import { createRouteHandler } from "@silo-storage/sdk-next";

import { fileRouter } from "@/lib/sdk-demo/file-router";
import { getSiloCore } from "@/lib/sdk-demo/silo";

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

function toErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Failed to initialize SDK demo upload route.";

  return new Response(JSON.stringify({ error: "Configuration Error", message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

export function GET() {
  try {
    return getRouteHandler().GET();
  } catch (error) {
    return toErrorResponse(error);
  }
}

export function POST(request: Request) {
  try {
    return getRouteHandler().POST(request);
  } catch (error) {
    return toErrorResponse(error);
  }
}
