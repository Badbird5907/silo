import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

import { env } from "@/env";

export const getSiloCore = () => {
  return createSiloCoreFromToken({
    url: env.SILO_URL,
    token: env.SILO_TOKEN,
    cdnHost: env.NEXT_PUBLIC_SILO_CDN,
    uploadStrategy: "self",
  });
};
