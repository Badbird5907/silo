import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { z } from "zod/v4";

import {
  files,
  projectEnvironments,
  projects,
  usageDaily,
  usageEvents,
} from "@silo-storage/db/schema";

import { organizationProcedure, requirePermission } from "../trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function backfillDailyData<T extends { date: string }>(
  dailyData: T[],
  startDate: string,
  endDate: string,
  createZeroRow: (date: string) => T,
) {
  const dataByDate = new Map(dailyData.map((entry) => [entry.date, entry]));

  const filledData: T[] = [];
  for (
    let currentDate = new Date(`${startDate}T00:00:00.000Z`);
    currentDate <= new Date(`${endDate}T00:00:00.000Z`);
    currentDate = new Date(currentDate.getTime() + DAY_IN_MS)
  ) {
    const date = currentDate.toISOString().slice(0, 10);
    filledData.push(dataByDate.get(date) ?? createZeroRow(date));
  }

  return filledData;
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

      const dailyStats = await ctx.db
        .select({
          date: usageDaily.date,
          uploadsStarted: usageDaily.uploadsStarted,
          uploadsCompleted: usageDaily.uploadsCompleted,
          uploadsFailed: usageDaily.uploadsFailed,
          downloads: usageDaily.downloads,
          bytesUploaded: usageDaily.bytesUploaded,
          bytesDownloaded: usageDaily.bytesDownloaded,
          storageBytes: usageDaily.storageBytes,
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
        )
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
            eq(usageDaily.projectId, input.projectId),
            ...(input.environmentId
              ? [eq(usageDaily.environmentId, input.environmentId)]
              : []),
            gte(usageDaily.date, startDate),
            lte(usageDaily.date, endDate),
          ),
        );

      const storageResult = await ctx.db
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
        );

      const totalStorage = storageResult[0]?.totalBytes ?? 0;
      const fileCount = storageResult[0]?.fileCount ?? 0;
      const dailyStatsWithBackfill = backfillDailyData(
        dailyStats,
        startDate,
        endDate,
        (date) => ({
          date,
          uploadsStarted: 0,
          uploadsCompleted: 0,
          uploadsFailed: 0,
          downloads: 0,
          bytesUploaded: 0,
          bytesDownloaded: 0,
          storageBytes: 0,
        }),
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
      const dailyStatsWithBackfill = backfillDailyData(
        dailyStats,
        startDate,
        endDate,
        (date) => ({
          date,
          uploadsStarted: 0,
          uploadsCompleted: 0,
          uploadsFailed: 0,
          downloads: 0,
          bytesUploaded: 0,
          bytesDownloaded: 0,
        }),
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
