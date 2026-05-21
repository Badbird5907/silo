import type { Db } from "@silo-storage/db/client";
import { and, eq, sum } from "drizzle-orm";

import { files, projects, usageDaily } from "@silo-storage/db/schema";

type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
type AnalyticsExecutor = Db | DbTransaction;

interface StorageSnapshotInput {
  projectId: string;
  environmentId: string;
  date?: Date | string;
}

function resolveSnapshotDate(date: Date | string | undefined): string {
  if (typeof date === "string") {
    return date;
  }

  return (date ?? new Date()).toISOString().slice(0, 10);
}

export async function syncEnvironmentStorageSnapshot(
  db: AnalyticsExecutor,
  input: StorageSnapshotInput,
): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, input.projectId),
    columns: { parentOrganizationId: true },
  });

  if (!project?.parentOrganizationId) {
    return;
  }

  const [storageResult] = await db
    .select({
      totalBytes: sum(files.size),
    })
    .from(files)
    .where(
      and(
        eq(files.projectId, input.projectId),
        eq(files.environmentId, input.environmentId),
      ),
    );

  const storageBytes = Number(storageResult?.totalBytes ?? 0);
  const snapshotDate = resolveSnapshotDate(input.date);

  await db
    .insert(usageDaily)
    .values({
      organizationId: project.parentOrganizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      date: snapshotDate,
      storageBytes,
    })
    .onConflictDoUpdate({
      target: [
        usageDaily.organizationId,
        usageDaily.projectId,
        usageDaily.environmentId,
        usageDaily.date,
      ],
      set: {
        storageBytes,
        updatedAt: new Date(),
      },
    });
}

export async function syncEnvironmentStorageSnapshots(
  db: AnalyticsExecutor,
  scopes: StorageSnapshotInput[],
): Promise<void> {
  const seen = new Set<string>();

  for (const scope of scopes) {
    const snapshotDate = resolveSnapshotDate(scope.date);
    const key = `${scope.projectId}:${scope.environmentId}:${snapshotDate}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    await syncEnvironmentStorageSnapshot(db, {
      ...scope,
      date: snapshotDate,
    });
  }
}
