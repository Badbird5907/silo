import type { Db } from "@silo-storage/db/client";

import { eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { projectEnvironments, projects } from "@silo-storage/db/schema";
import {
  sanitizeForSlug,
  validateProjectSlug,
} from "@silo-storage/shared/slug";

import { env } from "../env";

const DEFAULT_ENVIRONMENTS = [
  { name: "Production", slug: "production", type: "production" as const },
];

export type ProjectSlugAvailability =
  | { available: true }
  | { available: false; reason: "invalid" | "reserved" | "taken" };

export async function checkProjectSlugAvailability(
  db: Db,
  rawSlug: string,
): Promise<ProjectSlugAvailability> {
  const slug = sanitizeForSlug(rawSlug);

  if (slug !== rawSlug) {
    return { available: false, reason: "invalid" };
  }

  const validation = validateProjectSlug(slug);
  if (!validation.valid) {
    if (validation.error?.includes("reserved")) {
      return { available: false, reason: "reserved" };
    }

    return { available: false, reason: "invalid" };
  }

  const existingProject = await db.query.projects.findFirst({
    where: eq(projects.slug, slug),
    columns: { id: true },
  });

  if (existingProject) {
    return { available: false, reason: "taken" };
  }

  return { available: true };
}

export async function listProjects(db: Db, organizationId: string) {
  return db.query.projects.findMany({
    where: eq(projects.parentOrganizationId, organizationId),
    orderBy: (projects, { desc }) => [desc(projects.createdAt)],
  });
}

export async function getProjectById(db: Db, projectId: string) {
  return db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
}

export async function createProject(
  db: Db,
  input: { name: string; slug: string; organizationId: string },
) {
  const [newProject] = await db
    .insert(projects)
    .values({
      name: input.name,
      slug: input.slug,
      parentOrganizationId: input.organizationId,
    })
    .returning();

  if (!newProject) {
    throw new Error("Failed to create project");
  }

  // Create default environments
  await db.insert(projectEnvironments).values(
    DEFAULT_ENVIRONMENTS.map((env) => ({
      projectId: newProject.id,
      name: env.name,
      slug: env.slug,
      type: env.type,
    })),
  );

  return newProject;
}

export async function updateProject(
  db: Db,
  input: {
    id: string;
    name?: string;
    defaultFileAccess?: "public" | "private";
    pendingUploadFailAfterHours?: number;
  },
) {
  const updates: Partial<typeof projects.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.defaultFileAccess !== undefined)
    updates.defaultFileAccess = input.defaultFileAccess;
  if (input.pendingUploadFailAfterHours !== undefined)
    updates.pendingUploadFailAfterHours = input.pendingUploadFailAfterHours;

  if (Object.keys(updates).length === 0) {
    return db.query.projects.findFirst({
      where: eq(projects.id, input.id),
    });
  }

  const [updated] = await db
    .update(projects)
    .set(updates)
    .where(eq(projects.id, input.id))
    .returning();

  return updated;
}

export async function deleteProject(projectId: string) {
  await scheduleProjectObjectDeletion(projectId);
  const [deleted] = await db
    .delete(projects)
    .where(eq(projects.id, projectId))
    .returning();
  return deleted;
}

export async function scheduleProjectObjectDeletion(projectId: string) {
  const prefix = `${projectId}/`;
  let cursor: string | undefined;

  for (let i = 0; i < 2000; i++) {
    const response = await fetch(`${env.WORKER_URL}/internal/delete-prefix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CALLBACK_SECRET}`,
      },
      body: JSON.stringify({
        prefix,
        cursor,
        blocking: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Failed to delete project objects. Worker responded with ${response.status} ${body}`,
      );
    }

    const json = (await response.json()) as {
      truncated?: boolean;
      cursor?: string | null;
    };

    if (!json.truncated) {
      return json;
    }

    cursor = json.cursor ?? undefined;
    if (!cursor) {
      return json;
    }
  }

  throw new Error("Project object deletion exceeded maximum pagination depth");
}
