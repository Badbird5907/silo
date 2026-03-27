import type { MiddlewareHandler } from "hono";

import type { Bindings, Variables } from "../types/bindings";
import { lookupProject } from "../lib/project-lookup";
import { extractProjectSlug } from "../lib/subdomain";
import { Errors } from "../utils/errors";

export const requireProject: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const hostname = new URL(c.req.url).hostname;
  const projectSlug = extractProjectSlug(hostname, c.env.WORKER_DOMAIN);
  if (!projectSlug) {
    throw Errors.projectNotFound("no-subdomain");
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
  const hostname = new URL(c.req.url).hostname;
  const projectSlug = extractProjectSlug(hostname, c.env.WORKER_DOMAIN);

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
