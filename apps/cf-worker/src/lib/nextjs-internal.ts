import type { Bindings } from "../types/bindings";

export function buildNextJsInternalHeaders(
  env: Bindings,
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    Authorization: `Bearer ${env.CALLBACK_SECRET}`,
    ...headers,
  };
}
