import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "./src/client";
import { files, projectEnvironments, projects, usageDaily } from "./src/schema";

async function backfillStorageSnapshots() {
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const environments = await db
    .select({
      organizationId: projects.parentOrganizationId,
      projectId: projectEnvironments.projectId,
      environmentId: projectEnvironments.id,
    })
    .from(projectEnvironments)
    .innerJoin(projects, eq(projectEnvironments.projectId, projects.id))
    .where(
      and(
        eq(projects.lifecycleState, "active"),
        eq(projectEnvironments.lifecycleState, "active"),
        isNotNull(projects.parentOrganizationId),
      ),
    );

  const storageRows = await db
    .select({
      projectId: files.projectId,
      environmentId: files.environmentId,
      totalBytes: sql<number>`coalesce(sum(${files.size}), 0)::bigint`,
    })
    .from(files)
    .groupBy(files.projectId, files.environmentId);

  const storageByScope = new Map(
    storageRows.map((row) => [
      `${row.projectId}:${row.environmentId}`,
      Number(row.totalBytes),
    ]),
  );

  let upsertedCount = 0;

  for (const environment of environments) {
    const storageBytes =
      storageByScope.get(
        `${environment.projectId}:${environment.environmentId}`,
      ) ?? 0;

    await db
      .insert(usageDaily)
      .values({
        organizationId: environment.organizationId!,
        projectId: environment.projectId,
        environmentId: environment.environmentId,
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

    upsertedCount += 1;
  }

  console.log(
    `Backfilled ${upsertedCount} storage snapshot(s) for ${snapshotDate}.`,
  );
}

backfillStorageSnapshots()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to backfill storage snapshots:", error);
    process.exit(1);
  });
