import type { RouterConfig } from "./types";

export function extractRouterConfig<TRouter extends Record<string, unknown>>(
  router: TRouter,
): RouterConfig<TRouter> {
  const entries = Object.entries(router).flatMap(([routeSlug, route]) => {
    const routeConfig = (route as { routeConfig?: unknown }).routeConfig;
    return routeConfig === undefined ? [] : [[routeSlug, routeConfig] as const];
  });

  return Object.fromEntries(entries) as RouterConfig<TRouter>;
}
