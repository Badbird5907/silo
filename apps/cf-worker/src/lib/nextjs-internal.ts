import type { Bindings } from "../types/bindings";

export function buildNextJsInternalHeaders(
  env: Bindings,
  headers: Record<string, string> = {},
): Record<string, string> {
  const nextJsHeaders: Record<string, string> = {
    Authorization: `Bearer ${env.CALLBACK_SECRET}`,
    ...headers,
  };

  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    nextJsHeaders["x-vercel-protection-bypass"] =
      env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  return nextJsHeaders;
}
