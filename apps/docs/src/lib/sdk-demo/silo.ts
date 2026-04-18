import { env } from "@/env";
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

function requireEnv(name: string): string {
  const envMap = {
    NEXT_PUBLIC_SILO_CDN: env.NEXT_PUBLIC_SILO_CDN,
    SILO_TOKEN: env.SILO_TOKEN,
    SILO_URL: env.SILO_URL,
  } as const;
  const value = envMap[name as keyof typeof envMap];

  if (!value) {
    throw new Error(`SDK demo is missing required environment variable: ${name}`);
  }

  return value;
}

export function getSiloCore() {
  return createSiloCoreFromToken({
    url: requireEnv("SILO_URL"),
    token: requireEnv("SILO_TOKEN"),
    cdnHost: requireEnv("NEXT_PUBLIC_SILO_CDN"),
    uploadStrategy: "self",
  });
}
