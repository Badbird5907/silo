import type { Bindings } from "../types/bindings";
import type { ProjectInfo } from "../types/project";
import { projectInfoSchema } from "../types/project";
import { cacheProject, getCachedProject } from "../services/metadata-cache";
import { Errors, UploadError } from "../utils/errors";
import { buildNextJsInternalHeaders } from "./nextjs-internal";

export async function lookupProject(
  slug: string,
  env: Bindings,
): Promise<ProjectInfo> {
  try {
    const cached = await getCachedProject(slug, env);
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.error("Failed to read project metadata cache:", error);
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
      console.error(
        "Failed to lookup project:",
        response.status,
        response.statusText,
      );
      throw new Error(
        `Failed to lookup project: ${response.status} ${response.statusText}`,
      );
    }

    const project = projectInfoSchema.parse(await response.json());

    try {
      await cacheProject(slug, project, env);
    } catch (error) {
      console.error("Failed to write project metadata cache:", error);
    }

    return project;
  } catch (error) {
    if (error instanceof UploadError) {
      throw error;
    }
    console.error("Failed to lookup project:", error);
    throw new Error("Failed to lookup project");
  }
}
