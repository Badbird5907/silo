import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNotNull, lt, lte, sql, sum } from "drizzle-orm";
import { z } from "zod/v4";

import type { Db } from "@silo-storage/db/client";
import {
  fileKeys,
  files,
  projectEnvironments,
  projects,
  usageDaily,
  usageEvents,
} from "@silo-storage/db/schema";

import { organizationProcedure, requirePermission } from "../trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface DailyCounterRow {
  date: string;
  uploadsStarted: number;
  uploadsCompleted: number;
  uploadsFailed: number;
  downloads: number;
  bytesUploaded: number;
  bytesDownloaded: number;
}

export interface DailyStorageRow {
  environmentId: string;
  date: string;
  storageBytes: number;
}

function enumerateDates(startDate: string, endDate: string) {
  const dates: string[] = [];

  for (
    let currentDate = new Date(`${startDate}T00:00:00.000Z`);
    currentDate <= new Date(`${endDate}T00:00:00.000Z`);
    currentDate = new Date(currentDate.getTime() + DAY_IN_MS)
  ) {
    dates.push(currentDate.toISOString().slice(0, 10));
  }

  return dates;
}

function backfillCounterData(
  dailyData: DailyCounterRow[],
  startDate: string,
  endDate: string,
) {
  const dataByDate = new Map(dailyData.map((entry) => [entry.date, entry]));

  return enumerateDates(startDate, endDate).map(
    (date) =>
      dataByDate.get(date) ?? {
        date,
        uploadsStarted: 0,
        uploadsCompleted: 0,
        uploadsFailed: 0,
        downloads: 0,
        bytesUploaded: 0,
        bytesDownloaded: 0,
      },
  );
}

function buildEnvironmentStorageTimeline(
  dates: string[],
  currentRows: { date: string; storageBytes: number }[],
  previousRow?: { storageBytes: number },
) {
  const rowsByDate = new Map(
    currentRows.map((row) => [row.date, row.storageBytes] as const),
  );

  let lastKnownStorage = previousRow?.storageBytes ?? null;

  return dates.map((date) => {
    const snapshot = rowsByDate.get(date);

    if (snapshot !== undefined) {
      lastKnownStorage = snapshot;
    }

    return {
      date,
      storageBytes: lastKnownStorage,
    };
  });
}

function buildProjectStorageTimeline(
  dates: string[],
  currentRows: DailyStorageRow[],
  previousRows: DailyStorageRow[],
) {
  const environmentIds = new Set<string>();
  const rowsByDate = new Map<string, Map<string, number>>();
  const lastKnownByEnvironment = new Map<string, number>();

  for (const row of previousRows) {
    environmentIds.add(row.environmentId);
    if (!lastKnownByEnvironment.has(row.environmentId)) {
      lastKnownByEnvironment.set(row.environmentId, row.storageBytes);
    }
  }

  for (const row of currentRows) {
    environmentIds.add(row.environmentId);
    const dateRows = rowsByDate.get(row.date) ?? new Map<string, number>();
    dateRows.set(row.environmentId, row.storageBytes);
    rowsByDate.set(row.date, dateRows);
  }

  return dates.map((date) => {
    const dateRows = rowsByDate.get(date);
    let totalStorage = 0;
    let hasKnownStorage = false;

    for (const environmentId of environmentIds) {
      const snapshot = dateRows?.get(environmentId);
      if (snapshot !== undefined) {
        lastKnownByEnvironment.set(environmentId, snapshot);
      }

      const currentStorage = lastKnownByEnvironment.get(environmentId);
      if (currentStorage !== undefined) {
        totalStorage += currentStorage;
        hasKnownStorage = true;
      }
    }

    return {
      date,
      storageBytes: hasKnownStorage ? totalStorage : null,
    };
  });
}

async function getProjectDailyCounters(
  db: Db,
  input: {
    projectId: string;
    environmentId?: string;
  },
  startDate: string,
  endDate: string,
) {
  if (input.environmentId) {
    return db
      .select({
        date: usageDaily.date,
        uploadsStarted: usageDaily.uploadsStarted,
        uploadsCompleted: usageDaily.uploadsCompleted,
        uploadsFailed: usageDaily.uploadsFailed,
        downloads: usageDaily.downloads,
        bytesUploaded: usageDaily.bytesUploaded,
        bytesDownloaded: usageDaily.bytesDownloaded,
      })
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.projectId, input.projectId),
          eq(usageDaily.environmentId, input.environmentId),
          gte(usageDaily.date, startDate),
          lte(usageDaily.date, endDate),
        ),
      )
      .orderBy(usageDaily.date);
  }

  return db
    .select({
      date: usageDaily.date,
      uploadsStarted: sql<number>`coalesce(sum(${usageDaily.uploadsStarted}), 0)::int`,
      uploadsCompleted: sql<number>`coalesce(sum(${usageDaily.uploadsCompleted}), 0)::int`,
      uploadsFailed: sql<number>`coalesce(sum(${usageDaily.uploadsFailed}), 0)::int`,
      downloads: sql<number>`coalesce(sum(${usageDaily.downloads}), 0)::int`,
      bytesUploaded: sql<number>`coalesce(sum(${usageDaily.bytesUploaded}), 0)::bigint`,
      bytesDownloaded: sql<number>`coalesce(sum(${usageDaily.bytesDownloaded}), 0)::bigint`,
    })
    .from(usageDaily)
    .where(
      and(
        eq(usageDaily.projectId, input.projectId),
        gte(usageDaily.date, startDate),
        lte(usageDaily.date, endDate),
      ),
    )
    .groupBy(usageDaily.date)
    .orderBy(usageDaily.date);
}

async function getProjectStorageTimeline(
  db: Db,
  input: {
    projectId: string;
    environmentId?: string;
  },
  startDate: string,
  endDate: string,
) {
  const dates = enumerateDates(startDate, endDate);

  if (input.environmentId) {
    const [previousRows, currentRows] = await Promise.all([
      db
        .select({
          date: usageDaily.date,
          storageBytes: usageDaily.storageBytes,
        })
        .from(usageDaily)
        .where(
          and(
            eq(usageDaily.projectId, input.projectId),
            eq(usageDaily.environmentId, input.environmentId),
            isNotNull(usageDaily.storageBytes),
            lt(usageDaily.date, startDate),
          ),
        )
        .orderBy(desc(usageDaily.date))
        .limit(1),
      db
        .select({
          date: usageDaily.date,
          storageBytes: usageDaily.storageBytes,
        })
        .from(usageDaily)
        .where(
          and(
            eq(usageDaily.projectId, input.projectId),
            eq(usageDaily.environmentId, input.environmentId),
            isNotNull(usageDaily.storageBytes),
            gte(usageDaily.date, startDate),
            lte(usageDaily.date, endDate),
          ),
        )
        .orderBy(usageDaily.date),
    ]);

    return buildEnvironmentStorageTimeline(
      dates,
      currentRows.map((row) => ({
        date: row.date,
        storageBytes: Number(row.storageBytes),
      })),
      previousRows[0]
        ? { storageBytes: Number(previousRows[0].storageBytes) }
        : undefined,
    );
  }

  const [previousRows, currentRows] = await Promise.all([
    db
      .select({
        environmentId: usageDaily.environmentId,
        date: usageDaily.date,
        storageBytes: usageDaily.storageBytes,
      })
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.projectId, input.projectId),
          isNotNull(usageDaily.environmentId),
          isNotNull(usageDaily.storageBytes),
          lt(usageDaily.date, startDate),
        ),
      )
      .orderBy(usageDaily.environmentId, desc(usageDaily.date)),
    db
      .select({
        environmentId: usageDaily.environmentId,
        date: usageDaily.date,
        storageBytes: usageDaily.storageBytes,
      })
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.projectId, input.projectId),
          isNotNull(usageDaily.environmentId),
          isNotNull(usageDaily.storageBytes),
          gte(usageDaily.date, startDate),
          lte(usageDaily.date, endDate),
        ),
      )
      .orderBy(usageDaily.environmentId, usageDaily.date),
  ]);

  const previousByEnvironment = new Set<string>();
  const dedupedPreviousRows: DailyStorageRow[] = [];

  for (const row of previousRows) {
    if (!row.environmentId || previousByEnvironment.has(row.environmentId)) {
      continue;
    }

    previousByEnvironment.add(row.environmentId);
    dedupedPreviousRows.push({
      environmentId: row.environmentId,
      date: row.date,
      storageBytes: Number(row.storageBytes),
    });
  }

  return buildProjectStorageTimeline(
    dates,
    currentRows
      .filter(
        (
          row,
        ): row is {
          environmentId: string;
          date: string;
          storageBytes: number;
        } => row.environmentId !== null,
      )
      .map((row) => ({
        environmentId: row.environmentId,
        date: row.date,
        storageBytes: Number(row.storageBytes),
      })),
    dedupedPreviousRows,
  );
}

async function getStoredFilesTimeline(
  db: Db,
  input: {
    projectId: string;
    environmentId?: string;
  },
  startDate: string,
  endDate: string,
) {
  const dates = enumerateDates(startDate, endDate);
  const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
  const endDateExclusive = new Date(`${endDate}T00:00:00.000Z`);
  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 1);

  const baseConditions = [
    eq(fileKeys.projectId, input.projectId),
    eq(fileKeys.status, "completed"),
    isNotNull(fileKeys.uploadCompletedAt),
    ...(input.environmentId
      ? [eq(fileKeys.environmentId, input.environmentId)]
      : []),
  ];

  const [baselineResult, dailyRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(fileKeys)
      .where(and(...baseConditions, lt(fileKeys.uploadCompletedAt, startDateTime))),
    db
      .select({
        date: sql<string>`${fileKeys.uploadCompletedAt}::date::text`,
        storedFiles: sql<number>`count(*)::int`,
      })
      .from(fileKeys)
      .where(
        and(
          ...baseConditions,
          gte(fileKeys.uploadCompletedAt, startDateTime),
          lt(fileKeys.uploadCompletedAt, endDateExclusive),
        ),
      )
      .groupBy(sql`${fileKeys.uploadCompletedAt}::date`)
      .orderBy(sql`${fileKeys.uploadCompletedAt}::date`),
  ]);

  const countsByDate = new Map(
    dailyRows.map((row) => [row.date, Number(row.storedFiles)] as const),
  );
  let cumulativeCount = Number(baselineResult[0]?.count ?? 0);

  return dates.map((date) => {
    cumulativeCount += countsByDate.get(date) ?? 0;

    return {
      date,
      storedFiles: cumulativeCount,
    };
  });
}

export const analyticsRouter = {
  getProjectStats: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        environmentId: z.string().optional(),
      }),
    )
    .use(requirePermission({ analytics: ["read"] }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (project?.parentOrganizationId !== ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }

      if (input.environmentId) {
        const environment = await ctx.db.query.projectEnvironments.findFirst({
          where: and(
            eq(projectEnvironments.id, input.environmentId),
            eq(projectEnvironments.projectId, input.projectId),
          ),
        });

        if (!environment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Environment not found",
          });
        }
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startDate =
        input.startDate ?? thirtyDaysAgo.toISOString().slice(0, 10);
      const endDate = input.endDate ?? now.toISOString().slice(0, 10);

      const [
        dailyCounterStats,
        dailyStorageStats,
        dailyStoredFilesStats,
        totals,
        storageResult,
      ] =
        await Promise.all([
          getProjectDailyCounters(ctx.db, input, startDate, endDate),
          getProjectStorageTimeline(ctx.db, input, startDate, endDate),
          getStoredFilesTimeline(ctx.db, input, startDate, endDate),
          ctx.db
            .select({
              totalUploadsStarted: sum(usageDaily.uploadsStarted),
              totalUploadsCompleted: sum(usageDaily.uploadsCompleted),
              totalUploadsFailed: sum(usageDaily.uploadsFailed),
              totalDownloads: sum(usageDaily.downloads),
              totalBytesUploaded: sum(usageDaily.bytesUploaded),
              totalBytesDownloaded: sum(usageDaily.bytesDownloaded),
            })
            .from(usageDaily)
            .where(
              and(
                eq(usageDaily.projectId, input.projectId),
                ...(input.environmentId
                  ? [eq(usageDaily.environmentId, input.environmentId)]
                  : []),
                gte(usageDaily.date, startDate),
                lte(usageDaily.date, endDate),
              ),
            ),
          ctx.db
            .select({
              totalBytes: sum(files.size),
              fileCount: sql<number>`count(*)::int`,
            })
            .from(files)
            .where(
              and(
                eq(files.projectId, input.projectId),
                ...(input.environmentId
                  ? [eq(files.environmentId, input.environmentId)]
                  : []),
              ),
            ),
        ]);

      const totalStorage = storageResult[0]?.totalBytes ?? 0;
      const fileCount = storageResult[0]?.fileCount ?? 0;
      const backfilledCounterStats = backfillCounterData(
        dailyCounterStats.map((row) => ({
          date: row.date,
          uploadsStarted: Number(row.uploadsStarted),
          uploadsCompleted: Number(row.uploadsCompleted),
          uploadsFailed: Number(row.uploadsFailed),
          downloads: Number(row.downloads),
          bytesUploaded: Number(row.bytesUploaded),
          bytesDownloaded: Number(row.bytesDownloaded),
        })),
        startDate,
        endDate,
      );

      const dailyStatsWithBackfill = backfilledCounterStats.map((row, index) => ({
        ...row,
        storageBytes: dailyStorageStats[index]?.storageBytes ?? null,
        storedFiles: dailyStoredFilesStats[index]?.storedFiles ?? 0,
      }));

      return {
        daily: dailyStatsWithBackfill,
        totals: {
          uploadsStarted: Number(totals[0]?.totalUploadsStarted ?? 0),
          uploadsCompleted: Number(totals[0]?.totalUploadsCompleted ?? 0),
          uploadsFailed: Number(totals[0]?.totalUploadsFailed ?? 0),
          downloads: Number(totals[0]?.totalDownloads ?? 0),
          bytesUploaded: Number(totals[0]?.totalBytesUploaded ?? 0),
          bytesDownloaded: Number(totals[0]?.totalBytesDownloaded ?? 0),
        },
        storage: {
          totalBytes: Number(totalStorage),
          fileCount,
        },
      };
    }),

  getOrganizationStats: organizationProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    )
    .use(requirePermission({ analytics: ["read"] }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startDate =
        input.startDate ?? thirtyDaysAgo.toISOString().slice(0, 10);
      const endDate = input.endDate ?? now.toISOString().slice(0, 10);

      const dailyStats = await ctx.db
        .select({
          date: usageDaily.date,
          uploadsStarted: sql<number>`sum(${usageDaily.uploadsStarted})::int`,
          uploadsCompleted: sql<number>`sum(${usageDaily.uploadsCompleted})::int`,
          uploadsFailed: sql<number>`sum(${usageDaily.uploadsFailed})::int`,
          downloads: sql<number>`sum(${usageDaily.downloads})::int`,
          bytesUploaded: sql<number>`sum(${usageDaily.bytesUploaded})::bigint`,
          bytesDownloaded: sql<number>`sum(${usageDaily.bytesDownloaded})::bigint`,
        })
        .from(usageDaily)
        .where(
          and(
            eq(usageDaily.organizationId, ctx.organizationId),
            gte(usageDaily.date, startDate),
            lte(usageDaily.date, endDate),
          ),
        )
        .groupBy(usageDaily.date)
        .orderBy(usageDaily.date);

      const totals = await ctx.db
        .select({
          totalUploadsStarted: sum(usageDaily.uploadsStarted),
          totalUploadsCompleted: sum(usageDaily.uploadsCompleted),
          totalUploadsFailed: sum(usageDaily.uploadsFailed),
          totalDownloads: sum(usageDaily.downloads),
          totalBytesUploaded: sum(usageDaily.bytesUploaded),
          totalBytesDownloaded: sum(usageDaily.bytesDownloaded),
        })
        .from(usageDaily)
        .where(
          and(
            eq(usageDaily.organizationId, ctx.organizationId),
            gte(usageDaily.date, startDate),
            lte(usageDaily.date, endDate),
          ),
        );

      const orgProjects = await ctx.db.query.projects.findMany({
        where: eq(projects.parentOrganizationId, ctx.organizationId),
        columns: { id: true },
      });

      const projectIds = orgProjects.map((p) => p.id);

      let totalStorage = 0;
      let fileCount = 0;

      if (projectIds.length > 0) {
        const storageResult = await ctx.db
          .select({
            totalBytes: sum(files.size),
            fileCount: sql<number>`count(*)::int`,
          })
          .from(files)
          .where(sql`${files.projectId} IN ${projectIds}`);

        totalStorage = Number(storageResult[0]?.totalBytes ?? 0);
        fileCount = storageResult[0]?.fileCount ?? 0;
      }

      const dailyStatsWithBackfill = backfillCounterData(
        dailyStats.map((row) => ({
          date: row.date,
          uploadsStarted: Number(row.uploadsStarted),
          uploadsCompleted: Number(row.uploadsCompleted),
          uploadsFailed: Number(row.uploadsFailed),
          downloads: Number(row.downloads),
          bytesUploaded: Number(row.bytesUploaded),
          bytesDownloaded: Number(row.bytesDownloaded),
        })),
        startDate,
        endDate,
      );

      return {
        daily: dailyStatsWithBackfill,
        totals: {
          uploadsStarted: Number(totals[0]?.totalUploadsStarted ?? 0),
          uploadsCompleted: Number(totals[0]?.totalUploadsCompleted ?? 0),
          uploadsFailed: Number(totals[0]?.totalUploadsFailed ?? 0),
          downloads: Number(totals[0]?.totalDownloads ?? 0),
          bytesUploaded: Number(totals[0]?.totalBytesUploaded ?? 0),
          bytesDownloaded: Number(totals[0]?.totalBytesDownloaded ?? 0),
        },
        storage: {
          totalBytes: totalStorage,
          fileCount,
        },
      };
    }),

  getRecentEvents: organizationProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        environmentId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .use(requirePermission({ analytics: ["read"] }))
    .query(async ({ ctx, input }) => {
      if (input.projectId) {
        const project = await ctx.db.query.projects.findFirst({
          where: eq(projects.id, input.projectId),
        });

        if (project?.parentOrganizationId !== ctx.organizationId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this project",
          });
        }
      }
      if (input.environmentId && !input.projectId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "environmentId requires projectId",
        });
      }

      if (input.projectId && input.environmentId) {
        const environment = await ctx.db.query.projectEnvironments.findFirst({
          where: and(
            eq(projectEnvironments.id, input.environmentId),
            eq(projectEnvironments.projectId, input.projectId),
          ),
        });

        if (!environment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Environment not found",
          });
        }
      }

      const conditions = [eq(usageEvents.organizationId, ctx.organizationId)];
      if (input.projectId) {
        conditions.push(eq(usageEvents.projectId, input.projectId));
      }
      if (input.environmentId) {
        conditions.push(eq(usageEvents.environmentId, input.environmentId));
      }

      const events = await ctx.db.query.usageEvents.findMany({
        where: and(...conditions),
        orderBy: desc(usageEvents.createdAt),
        limit: input.limit,
        with: {
          project: { columns: { name: true, slug: true } },
          environment: { columns: { name: true, slug: true } },
          file: {
            columns: { id: true },
            with: {
              fileKeys: {
                columns: { id: true, fileName: true },
                limit: 1,
              },
            },
          },
        },
      });

      return events;
    }),
} satisfies TRPCRouterRecord;
