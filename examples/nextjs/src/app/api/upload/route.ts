import { auth } from "@clerk/nextjs/server";
import { createSiloCoreFromToken, parseSiloToken } from "@silo-storage/sdk-core";
import { createRouteHandler } from "@silo-storage/sdk-next";

import { fileRouter } from "@/upload";

function requireEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const siloToken = requireEnv("SILO_TOKEN");
const parsedToken = parseSiloToken(siloToken);

const core = createSiloCoreFromToken({
  url: requireEnv("SILO_URL"),
  token: siloToken,
  cdnHost: requireEnv("NEXT_PUBLIC_SILO_CDN"),
});

export const { GET, POST } = createRouteHandler({
  router: fileRouter,
  core,
  signingSecret: parsedToken.signingSecret,
  resolveContext: async () => {
    const { userId } = await auth();
    return { userId };
  },
});
