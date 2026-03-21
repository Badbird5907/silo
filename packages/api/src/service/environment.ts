import type { Db } from "@silo-storage/db/client";
import { and, eq } from "@silo-storage/db";
import { projectEnvironments } from "@silo-storage/db/schema";
import { nanoid } from "nanoid";
import { env } from "../env";
const WEBHOOK_EVENTS = ["upload.completed", "upload.failed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
const WEBHOOK_EVENT_SET = new Set<WebhookEvent>(WEBHOOK_EVENTS);

function toSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getUniqueSlug(
  db: Db,
  projectId: string,
  initialSlug: string,
  excludeEnvironmentId?: string,
) {
  const existingEnvs = await db.query.projectEnvironments.findMany({
    where: eq(projectEnvironments.projectId, projectId),
    columns: { slug: true, id: true },
  });

  const existingSlugs = new Set(
    existingEnvs
      .filter((env) => (excludeEnvironmentId ? env.id !== excludeEnvironmentId : true))
      .map((env) => env.slug),
  );

  let slug = initialSlug;
  let counter = 1;
  while (existingSlugs.has(slug)) {
    slug = `${initialSlug}-${counter}`;
    counter++;
  }

  return slug;
}

export async function listEnvironments(db: Db, projectId: string) {
  return db.query.projectEnvironments.findMany({
    where: eq(projectEnvironments.projectId, projectId),
    orderBy: (env, { asc }) => [asc(env.createdAt)],
  });
}

export async function getEnvironmentById(db: Db, environmentId: string) {
  return db.query.projectEnvironments.findFirst({
    where: eq(projectEnvironments.id, environmentId),
  });
}

export async function createEnvironment(
  db: Db,
  input: {
    projectId: string;
    name: string;
    type: "development" | "staging" | "production";
    ownerUserId?: string | null;
    slug?: string;
  },
) {
  const slugBase = toSlug(input.slug ?? input.name);
  const slug = await getUniqueSlug(db, input.projectId, slugBase);

  const [newEnv] = await db
    .insert(projectEnvironments)
    .values({
      projectId: input.projectId,
      name: input.name,
      slug,
      type: input.type,
      ownerUserId: input.ownerUserId ?? null,
    })
    .returning();

  return newEnv;
}

export async function createPersonalDevelopmentEnvironment(
  db: Db,
  input: {
    projectId: string;
    userId: string;
    preferredName?: string;
    userName?: string | null;
  },
) {
  const existing = await db.query.projectEnvironments.findFirst({
    where: and(
      eq(projectEnvironments.projectId, input.projectId),
      eq(projectEnvironments.ownerUserId, input.userId),
      eq(projectEnvironments.type, "development"),
    ),
  });

  if (existing) return existing;

  const resolvedName = input.preferredName?.trim() ?? input.userName?.trim() ?? "My Dev Env";

  return createEnvironment(db, {
    projectId: input.projectId,
    type: "development",
    ownerUserId: input.userId,
    name: resolvedName,
    slug: resolvedName,
  });
}

export async function updateEnvironment(
  db: Db,
  input: {
    id: string;
    name?: string;
    type?: "development" | "staging" | "production";
  },
) {
  const updates: Partial<typeof projectEnvironments.$inferInsert> = {};

  if (input.name !== undefined) {
    updates.name = input.name;

    const env = await db.query.projectEnvironments.findFirst({
      where: eq(projectEnvironments.id, input.id),
    });

    if (env?.projectId) {
      updates.slug = await getUniqueSlug(
        db,
        env.projectId,
        toSlug(input.name),
        input.id,
      );
    }
  }

  if (input.type !== undefined) updates.type = input.type;

  if (Object.keys(updates).length === 0) {
    return db.query.projectEnvironments.findFirst({
      where: eq(projectEnvironments.id, input.id),
    });
  }

  const [updated] = await db
    .update(projectEnvironments)
    .set(updates)
    .where(eq(projectEnvironments.id, input.id))
    .returning();

  return updated;
}

export function validateWebhookUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Invalid webhook URL");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Webhook URL must use http or https protocol");
  }

  return parsed.toString();
}

function sanitizeWebhookEvents(events?: WebhookEvent[]): WebhookEvent[] {
  if (!events) return [...WEBHOOK_EVENTS];
  const unique = new Set<WebhookEvent>();
  for (const event of events) {
    if (!WEBHOOK_EVENT_SET.has(event)) {
      throw new Error(`Unsupported webhook event: ${event}`);
    }
    unique.add(event);
  }
  return [...unique];
}

export function createWebhookSecret(): string {
  return `whsec_${nanoid(32)}`;
}

export async function updateEnvironmentWebhookConfig(
  db: Db,
  input: {
    environmentId: string;
    enabled?: boolean;
    webhookUrl?: string | null;
    webhookEvents?: WebhookEvent[];
    webhookSecret?: string | null;
  },
) {
  const updates: Partial<typeof projectEnvironments.$inferInsert> = {};

  if (input.enabled !== undefined) {
    updates.webhookEnabled = input.enabled;
  }

  if (input.webhookUrl !== undefined) {
    updates.webhookUrl =
      input.webhookUrl === null ? null : validateWebhookUrl(input.webhookUrl);
  }

  if (input.webhookEvents !== undefined) {
    updates.webhookEvents = sanitizeWebhookEvents(input.webhookEvents);
  }

  if (input.webhookSecret !== undefined) {
    updates.webhookSecret = input.webhookSecret;
  }

  if (Object.keys(updates).length === 0) {
    return db.query.projectEnvironments.findFirst({
      where: eq(projectEnvironments.id, input.environmentId),
    });
  }

  const [updated] = await db
    .update(projectEnvironments)
    .set(updates)
    .where(eq(projectEnvironments.id, input.environmentId))
    .returning();

  return updated;
}

export async function rotateEnvironmentWebhookSecret(
  db: Db,
  environmentId: string,
) {
  const newSecret = createWebhookSecret();
  const [updated] = await db
    .update(projectEnvironments)
    .set({ webhookSecret: newSecret })
    .where(eq(projectEnvironments.id, environmentId))
    .returning();

  return { environment: updated, secret: newSecret };
}

export async function deleteEnvironment(db: Db, environmentId: string, projectId: string) {
  await scheduleEnvironmentObjectDeletion({
    projectId,
    environmentId,
  });

  const [deleted] = await db
    .delete(projectEnvironments)
    .where(eq(projectEnvironments.id, environmentId))
    .returning();

  return deleted;
}

export async function scheduleEnvironmentObjectDeletion(params: {
  projectId: string;
  environmentId: string;
}) {
  const prefix = `${params.projectId}/${params.environmentId}/`;
  const response = await fetch(`${env.WORKER_URL}/internal/delete-prefix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CALLBACK_SECRET}`,
    },
    body: JSON.stringify({ prefix }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to schedule environment object deletion: ${response.status} ${body}`,
    );
  }
}
