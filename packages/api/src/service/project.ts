import type { Db } from "@silo-storage/db/client";

import { eq } from "@silo-storage/db";
import { projectEnvironments, projects } from "@silo-storage/db/schema";
import {
  sanitizeForSlug,
  validateProjectSlug,
} from "@silo-storage/shared/slug";

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
