import type { Db } from "@silo-storage/db/client";

import { and, eq, inArray } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import {
  fileKeys,
  fileLifecycleJobs,
  projectEnvironments,
  projects,
} from "@silo-storage/db/schema";
import {
  sanitizeForSlug,
  validateProjectSlug,
} from "@silo-storage/shared/slug";

import { env } from "../env";
import { markUploadAsFailed, UploadFailureError } from "./fileKey";
import { runLifecycleJobBatch } from "./lifecycleJob";

const DEFAULT_ENVIRONMENTS = [
  { name: "Production", slug: "production", type: "production" as const },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    imageDeliveryPolicy?:
      | "disabled"
      | "public_only"
      | "public_and_private_opt_in";
    defaultServeImage?: boolean;
    preserveImageExif?: boolean;
    pendingUploadFailAfterMinutes?: number;
    pendingUploadFailAfterHours?: number;
  },
) {
  const updates: Partial<typeof projects.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.defaultFileAccess !== undefined)
    updates.defaultFileAccess = input.defaultFileAccess;
  if (input.imageDeliveryPolicy !== undefined)
    updates.imageDeliveryPolicy = input.imageDeliveryPolicy;
  if (input.defaultServeImage !== undefined)
    updates.defaultServeImage = input.defaultServeImage;
  if (input.preserveImageExif !== undefined)
    updates.preserveImageExif = input.preserveImageExif;
  const pendingUploadFailAfterMinutes =
    input.pendingUploadFailAfterMinutes ?? input.pendingUploadFailAfterHours;
  if (pendingUploadFailAfterMinutes !== undefined)
    updates.pendingUploadFailAfterMinutes = pendingUploadFailAfterMinutes;

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
  const [project] = await db
    .update(projects)
    .set({ lifecycleState: "deleting" })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });

  if (!project) {
    return undefined;
  }

  const pendingUploads = await db
    .select({
      fileKeyId: fileKeys.id,
      environmentId: fileKeys.environmentId,
    })
    .from(fileKeys)
    .where(
      and(eq(fileKeys.projectId, projectId), eq(fileKeys.status, "pending")),
    );

  for (const pending of pendingUploads) {
    try {
      await markUploadAsFailed(db, {
        projectId,
        environmentId: pending.environmentId,
        fileKeyId: pending.fileKeyId,
        error: "Upload cancelled because project is being deleted",
      });
    } catch (error) {
      if (error instanceof UploadFailureError) {
        continue;
      }
      throw error;
    }
  }

  await drainLifecycleCleanup(projectId, `project-delete:${projectId}`);
  await scheduleProjectObjectDeletion(projectId);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const [deleted] = await db
        .delete(projects)
        .where(eq(projects.id, projectId))
        .returning();

      return deleted;
    } catch (error) {
      lastError = error;
      if (attempt >= 3) {
        break;
      }
      await sleep(100 * 2 ** (attempt - 1));
    }
  }

  throw new Error(
    `Failed to delete project metadata after object cleanup for project ${projectId}: ${lastError instanceof Error ? lastError.message : "Unknown error"}`,
  );
}

async function drainLifecycleCleanup(
  projectId: string,
  leaseOwner: string,
): Promise<void> {
  const limit = 200;

  for (let batch = 0; batch < 50; batch++) {
    await runLifecycleJobBatch(db, {
      limit,
      leaseSeconds: 60,
      leaseOwner,
    });

    const remainingCleanupJobs = await db
      .select({ id: fileLifecycleJobs.id })
      .from(fileLifecycleJobs)
      .where(
        and(
          eq(fileLifecycleJobs.projectId, projectId),
          inArray(fileLifecycleJobs.kind, ["delete_object", "abort_multipart"]),
          inArray(fileLifecycleJobs.state, [
            "pending",
            "retry",
            "leased",
            "dead",
          ]),
        ),
      )
      .limit(1);

    if (remainingCleanupJobs.length === 0) {
      return;
    }
  }

  throw new Error(
    "Lifecycle cleanup exceeded maximum batches while deleting project",
  );
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
