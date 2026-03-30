import { env } from "@/env";
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

export const getSiloCore = () => {
  return createSiloCoreFromToken({
    url: env.SILO_URL,
    token: env.SILO_TOKEN,
  });
}