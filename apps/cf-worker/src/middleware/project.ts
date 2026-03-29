import type { MiddlewareHandler } from "hono";

import type { Bindings, Variables } from "../types/bindings";
import { lookupProject } from "../lib/project-lookup";
import { extractProjectSlugFromUrl } from "../lib/subdomain";
import { Errors } from "../utils/errors";

export const requireProject: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const url = new URL(c.req.raw.url);
  const projectSlug = extractProjectSlugFromUrl(
    url,
    c.env.WORKER_DOMAIN,
    c.env.PROJECT_ROUTE_MODE,
    c.env.PROJECT_ROUTE_PREFIX,
  );
  if (!projectSlug) {
    throw Errors.projectNotFound("missing-project-scope");
  }

  const project = await lookupProject(projectSlug, c.env);

  c.set("projectSlug", projectSlug);
  c.set("projectId", project.id);
  c.set("defaultFileAccess", project.defaultFileAccess);
  c.set("projectLifecycleState", project.lifecycleState ?? "active");

  await next();
};

export const extractProject: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const url = new URL(c.req.raw.url);
  const projectSlug = extractProjectSlugFromUrl(
    url,
    c.env.WORKER_DOMAIN,
    c.env.PROJECT_ROUTE_MODE,
    c.env.PROJECT_ROUTE_PREFIX,
  );

  c.set("projectSlug", projectSlug);

  await next();
};

export const requireMainDomain: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const projectSlug = c.get("projectSlug");

  if (projectSlug !== null) {
    return c.json(
      { error: "This endpoint is only available on the main domain" },
      403,
    );
  }

  await next();
};
