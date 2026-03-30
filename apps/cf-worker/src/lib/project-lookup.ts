import type { Bindings } from "../types/bindings";
import type { ProjectInfo } from "../types/project";
import { Errors, TusError } from "../utils/errors";
import { buildNextJsInternalHeaders } from "./nextjs-internal";

export async function lookupProject(
  slug: string,
  env: Bindings,
): Promise<ProjectInfo> {
  const cacheKey = `project:slug:${slug}`;

  try {
    const cached = await env.PROJECT_CACHE.get(cacheKey, "json");
    if (cached) {
      return cached as ProjectInfo;
    }
  } catch (error) {
    console.error("Failed to read from KV cache:", error);
  }

  try {
    const response = await fetch(
      `${env.NEXTJS_CALLBACK_URL}/api/internal/lookup-project-slug`,
      {
        method: "POST",
        headers: buildNextJsInternalHeaders(env, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ slug }),
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw Errors.projectNotFound(slug);
      }
      console.error("Failed to lookup project:", response.status, response.statusText);
      throw new Error(
        `Failed to lookup project: ${response.status} ${response.statusText}`,
      );
    }

    const project = await response.json();

    try {
      await env.PROJECT_CACHE.put(cacheKey, JSON.stringify(project), {
        expirationTtl: 60,
      });
    } catch (error) {
      console.error("Failed to write to KV cache:", error);
    }

    return project as ProjectInfo;
  } catch (error) {
    if (error instanceof TusError) {
      throw error;
    }
    console.error("Failed to lookup project:", error);
    throw new Error("Failed to lookup project");
  }
}

export async function invalidateProjectCache(
  slug: string,
  env: Bindings,
): Promise<void> {
  const cacheKey = `project:slug:${slug}`;
  await env.PROJECT_CACHE.delete(cacheKey);
}
