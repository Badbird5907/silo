import type { RouterConfig } from "./types";

export function extractRouterConfig<TRouter extends Record<string, unknown>>(
  router: TRouter,
): RouterConfig<TRouter> {
  const entries = Object.entries(router).map(([routeSlug, route]) => [
    routeSlug,
    (route as { routeConfig: unknown }).routeConfig,
  ]);
  return Object.fromEntries(entries) as RouterConfig<TRouter>;
}
