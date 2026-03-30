export type ProjectRouteMode = "subdomain" | "path";
export const PROJECT_ROUTE_PREFIX = "/p";

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
): string | null {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const prefixWithSlash = `${PROJECT_ROUTE_PREFIX}/`;

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
): string | null {
  return (
    extractProjectSlug(url.hostname, workerDomain) ??
    extractProjectSlugFromPath(url.pathname)
  );
}

export function detectProjectRouteModeFromPath(
  pathname: string,
  projectSlug: string,
): ProjectRouteMode {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const pathPrefix = `${PROJECT_ROUTE_PREFIX}/${projectSlug}/`;
  if (
    normalizedPath === `${PROJECT_ROUTE_PREFIX}/${projectSlug}` ||
    normalizedPath.startsWith(pathPrefix)
  ) {
    return "path";
  }

  return "subdomain";
}

export function toProjectScopedPath(
  path: string,
  projectSlug: string,
  routeMode: ProjectRouteMode,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (routeMode === "path") {
    return `${PROJECT_ROUTE_PREFIX}/${projectSlug}${normalizedPath}`;
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
