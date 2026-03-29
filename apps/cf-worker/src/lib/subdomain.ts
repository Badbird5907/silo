export type ProjectRouteMode = "subdomain" | "path";

const DEFAULT_PROJECT_ROUTE_PREFIX = "/p";

export function resolveProjectRouteMode(
  routeMode: string | undefined,
): ProjectRouteMode {
  return routeMode === "path" ? "path" : "subdomain";
}

export function normalizeProjectRoutePrefix(prefix: string | undefined): string {
  const normalized = (prefix ?? DEFAULT_PROJECT_ROUTE_PREFIX).trim();
  const withLeadingSlash = normalized.startsWith("/")
    ? normalized
    : `/${normalized}`;
  const stripped = withLeadingSlash.replace(/\/+$/, "");

  if (!stripped || stripped === "/") {
    return DEFAULT_PROJECT_ROUTE_PREFIX;
  }

  // Prefix is expected to be one path segment (e.g. "/p").
  const [firstSegment] = stripped.split("/").filter(Boolean);
  return `/${firstSegment ?? "p"}`;
}

export function extractProjectSlug(
  hostname: string,
  workerDomain: string,
): string | null {
  const host = hostname.split(":")[0] ?? hostname;
  const domain = workerDomain.split(":")[0] ?? workerDomain;

  if (!host.endsWith(domain)) {
    return null;
  }

  const subdomain = host.slice(0, -(domain.length + 1));

  if (!subdomain) {
    return null;
  }

  return subdomain;
}

export function extractProjectSlugFromPath(
  pathname: string,
  routePrefix: string,
): string | null {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const normalizedPrefix = normalizeProjectRoutePrefix(routePrefix);
  const prefixWithSlash = `${normalizedPrefix}/`;

  if (!normalizedPath.startsWith(prefixWithSlash)) {
    return null;
  }

  const remainder = normalizedPath.slice(prefixWithSlash.length);
  const slug = remainder.split("/")[0];
  return slug === "" ? null : (slug ?? null);
}

export function extractProjectSlugFromUrl(
  url: URL,
  workerDomain: string,
  routeModeRaw: string | undefined,
  routePrefixRaw: string | undefined,
): string | null {
  const routeMode = resolveProjectRouteMode(routeModeRaw);

  if (routeMode === "path") {
    return extractProjectSlugFromPath(url.pathname, routePrefixRaw ?? "/p");
  }

  return extractProjectSlug(url.hostname, workerDomain);
}

export function toProjectScopedPath(
  path: string,
  projectSlug: string,
  routeModeRaw: string | undefined,
  routePrefixRaw: string | undefined,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const routeMode = resolveProjectRouteMode(routeModeRaw);

  if (routeMode === "path") {
    const routePrefix = normalizeProjectRoutePrefix(routePrefixRaw);
    return `${routePrefix}/${projectSlug}${normalizedPath}`;
  }

  return normalizedPath;
}

export function isValidSlug(slug: string): boolean {
  // must be 3-63 characters
  if (slug.length < 3 || slug.length > 63) {
    return false;
  }

  // lowercase alphanumeric + hyphens, start/end with alphanumeric
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug);
}
