import type { Db } from "@silo-storage/db/client";
import type { TRPCRouterRecord } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
import { z } from "zod/v4";

import {
  auditEvents,
  projectEnvironments,
  projects,
} from "@silo-storage/db/schema";
import {
  auditEventCategories,
  auditEventCodeOptions,
  auditResourceTypes,
  normalizeClientIp,
} from "@silo-storage/shared";

import { organizationProcedure, requirePermission } from "../trpc";

const dateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clientIpParamSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeClientIp(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid client IP",
      });
      return z.NEVER;
    }

    return normalized;
  });

async function validateProjectAccess(
  db: Db,
  projectId: string,
  organizationId: string,
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, parentOrganizationId: true },
  });

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found",
    });
  }

  if (project.parentOrganizationId !== organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have access to this project",
    });
  }
}

async function validateEnvironmentAccess(
  db: Db,
  projectId: string,
  environmentId: string,
) {
  const environment = await db.query.projectEnvironments.findFirst({
    where: and(
      eq(projectEnvironments.id, environmentId),
      eq(projectEnvironments.projectId, projectId),
    ),
    columns: { id: true },
  });

  if (!environment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Environment not found",
    });
  }
}

export const auditRouter = {
  list: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        environmentId: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().trim().min(1).optional(),
        actor: z
          .object({
            userId: z.string(),
          })
          .or(
            z.object({
              label: z.string(),
            }),
          )
          .optional(),
        clientIp: clientIpParamSchema.optional(),
        eventCategory: z.enum(auditEventCategories).optional(),
        eventCode: z.enum(auditEventCodeOptions).optional(),
        resourceType: z.enum(auditResourceTypes).optional(),
        startDate: dateParamSchema.optional(),
        endDate: dateParamSchema.optional(),
      }),
    )
    .use(requirePermission({ project: ["read"] }))
    .query(async ({ ctx, input }) => {
      await validateProjectAccess(ctx.db, input.projectId, ctx.organizationId);

      if (input.environmentId) {
        await validateEnvironmentAccess(
          ctx.db,
          input.projectId,
          input.environmentId,
        );
      }

      const conditions: SQL<unknown>[] = [
        eq(auditEvents.organizationId, ctx.organizationId),
        eq(auditEvents.projectId, input.projectId),
      ];

      if (input.environmentId) {
        conditions.push(eq(auditEvents.environmentId, input.environmentId));
      }

      if (input.search) {
        const pattern = `%${input.search}%`;
        const searchCondition = or(
          ilike(auditEvents.summary, pattern),
          ilike(auditEvents.eventCode, pattern),
          ilike(auditEvents.resourceLabel, pattern),
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      // if (input.actorQuery) {
      //   conditions.push(ilike(auditEvents.actorLabel, `%${input.actorQuery}%`));
      // }

      if (input.actor && "userId" in input.actor) {
        conditions.push(eq(auditEvents.actorUserId, input.actor.userId));
      }
      if (input.actor && "label" in input.actor) {
        conditions.push(
          ilike(auditEvents.actorLabel, `%${input.actor.label}%`),
        );
      }

      if (input.clientIp) {
        conditions.push(eq(auditEvents.clientIp, input.clientIp));
      }

      if (input.eventCategory) {
        conditions.push(eq(auditEvents.eventCategory, input.eventCategory));
      }

      if (input.eventCode) {
        conditions.push(eq(auditEvents.eventCode, input.eventCode));
      }

      if (input.resourceType) {
        conditions.push(eq(auditEvents.resourceType, input.resourceType));
      }

      if (input.startDate) {
        conditions.push(
          gte(auditEvents.createdAt, toStartOfDay(input.startDate)),
        );
      }

      if (input.endDate) {
        conditions.push(
          lt(auditEvents.createdAt, toStartOfNextDay(input.endDate)),
        );
      }

      const whereClause = and(...conditions);
      const [countResult] = await ctx.db
        .select({ count: count() })
        .from(auditEvents)
        .where(whereClause);

      const totalCount = countResult?.count ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalCount / input.pageSize));
      const offset = (input.page - 1) * input.pageSize;

      const rows = await ctx.db
        .select({
          id: auditEvents.id,
          actorType: auditEvents.actorType,
          actorUserId: auditEvents.actorUserId,
          actorMemberId: auditEvents.actorMemberId,
          actorLabel: auditEvents.actorLabel,
          eventCode: auditEvents.eventCode,
          eventCategory: auditEvents.eventCategory,
          resourceType: auditEvents.resourceType,
          resourceId: auditEvents.resourceId,
          resourceLabel: auditEvents.resourceLabel,
          clientIp: auditEvents.clientIp,
          status: auditEvents.status,
          summary: auditEvents.summary,
          changes: auditEvents.changes,
          metadata: auditEvents.metadata,
          createdAt: auditEvents.createdAt,
          projectId: auditEvents.projectId,
          environmentId: auditEvents.environmentId,
          environmentName: projectEnvironments.name,
          environmentSlug: projectEnvironments.slug,
        })
        .from(auditEvents)
        .leftJoin(
          projectEnvironments,
          eq(auditEvents.environmentId, projectEnvironments.id),
        )
        .where(whereClause)
        .orderBy(desc(auditEvents.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      return {
        events: rows.map((row) => ({
          id: row.id,
          actor: {
            type: row.actorType,
            userId: row.actorUserId,
            memberId: row.actorMemberId,
            label: row.actorLabel,
          },
          eventCode: row.eventCode,
          eventCategory: row.eventCategory,
          resource: {
            type: row.resourceType,
            id: row.resourceId,
            label: row.resourceLabel,
          },
          clientIp: row.clientIp,
          status: row.status,
          summary: row.summary,
          changes: row.changes ?? [],
          metadata: row.metadata,
          createdAt: row.createdAt,
          projectId: row.projectId,
          environment:
            row.environmentId && row.environmentName && row.environmentSlug
              ? {
                  id: row.environmentId,
                  name: row.environmentName,
                  slug: row.environmentSlug,
                }
              : null,
        })),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          totalCount,
          totalPages,
          hasNextPage: input.page < totalPages,
          hasPreviousPage: input.page > 1,
        },
      };
    }),

  recent: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        environmentId: z.string().optional(),
        limit: z.number().min(1).max(25).default(10),
      }),
    )
    .use(requirePermission({ project: ["read"] }))
    .query(async ({ ctx, input }) => {
      await validateProjectAccess(ctx.db, input.projectId, ctx.organizationId);

      if (input.environmentId) {
        await validateEnvironmentAccess(
          ctx.db,
          input.projectId,
          input.environmentId,
        );
      }

      const conditions: SQL<unknown>[] = [
        eq(auditEvents.organizationId, ctx.organizationId),
        eq(auditEvents.projectId, input.projectId),
        eq(auditEvents.eventCategory, "operational"),
      ];

      if (input.environmentId) {
        conditions.push(eq(auditEvents.environmentId, input.environmentId));
      }

      const rows = await ctx.db
        .select({
          id: auditEvents.id,
          actorType: auditEvents.actorType,
          actorLabel: auditEvents.actorLabel,
          eventCode: auditEvents.eventCode,
          resourceLabel: auditEvents.resourceLabel,
          status: auditEvents.status,
          summary: auditEvents.summary,
          metadata: auditEvents.metadata,
          createdAt: auditEvents.createdAt,
          environmentId: auditEvents.environmentId,
          environmentName: projectEnvironments.name,
          environmentSlug: projectEnvironments.slug,
        })
        .from(auditEvents)
        .leftJoin(
          projectEnvironments,
          eq(auditEvents.environmentId, projectEnvironments.id),
        )
        .where(and(...conditions))
        .orderBy(desc(auditEvents.createdAt))
        .limit(input.limit);

      return rows.map((row) => ({
        id: row.id,
        actorType: row.actorType,
        actorLabel: row.actorLabel,
        eventCode: row.eventCode,
        resourceLabel: row.resourceLabel,
        status: row.status,
        summary: row.summary,
        metadata: row.metadata,
        createdAt: row.createdAt,
        environment:
          row.environmentId && row.environmentName && row.environmentSlug
            ? {
                id: row.environmentId,
                name: row.environmentName,
                slug: row.environmentSlug,
              }
            : null,
      }));
    }),
} satisfies TRPCRouterRecord;

function toStartOfDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toStartOfNextDay(value: string): Date {
  const date = toStartOfDay(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
