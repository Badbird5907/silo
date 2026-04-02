import type { UploadCore } from "./upload/core";
import type { UploadCoreConfig } from "./upload/types";
import { createSiloCore, createSiloCoreFromToken } from "./upload/core";

export interface SiloClientConfig {
  apiBaseUrl: string;
  cdnHost?: string;
  token?: string;
  apiKey?: string;
}

export type SiloClientUploadConfig = Omit<
  UploadCoreConfig,
  "apiBaseUrl" | "apiKey"
> & {
  apiBaseUrl?: string;
  apiKey?: string;
};

export interface SiloClient {
  getApiBaseUrl(): string;
  getToken(): string | undefined;
  getApiKey(): string | undefined;
  createSiloCore(config: SiloClientUploadConfig): UploadCore;
  createSiloCoreFromToken(token?: string): UploadCore;
}

export function createSiloClient(config: SiloClientConfig): SiloClient {
  const apiBaseUrl = config.apiBaseUrl.replace(/\/+$/, "");

  return {
    getApiBaseUrl: () => apiBaseUrl,
    getToken: () => config.token,
    getApiKey: () => config.apiKey,
    createSiloCore: (uploadConfig) => {
      const apiKey = uploadConfig.apiKey ?? config.apiKey;
      if (!apiKey) {
        throw new Error(
          "Missing apiKey. Provide one in createSiloClient(...) or createSiloCore(...).",
        );
      }

      return createSiloCore({
        ...uploadConfig,
        apiBaseUrl: uploadConfig.apiBaseUrl ?? apiBaseUrl,
        apiKey,
      });
    },
    createSiloCoreFromToken: (token) => {
      const tokenToUse = token ?? config.token;
      if (!tokenToUse) {
        throw new Error(
          "Missing token. Provide one in createSiloClient(...) or createSiloCoreFromToken(...).",
        );
      }
      if (!config.cdnHost) {
        throw new Error(
          "Missing cdnHost. Provide one in createSiloClient(...) for createSiloCoreFromToken(...).",
        );
      }
      return createSiloCoreFromToken({
        url: apiBaseUrl,
        token: tokenToUse,
        cdnHost: config.cdnHost,
      });
    },
  };
}
