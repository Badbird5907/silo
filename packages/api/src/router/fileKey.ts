import type { TRPCRouterRecord } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod/v4";

import {
  fileKeys,
  files,
  projectEnvironments,
  projects,
} from "@silo-storage/db/schema";
import { auditEventCodes } from "@silo-storage/shared";

import { buildUserAuditActor, recordAuditEvent } from "../service/audit";
import {
  deleteFileKey,
  markUploadAsFailed,
  updateFileKeyAccess,
  UploadFailureError,
} from "../service/fileKey";
import { runLifecycleJobBatch } from "../service/lifecycleJob";
import { organizationProcedure, requirePermission } from "../trpc";

const sortFieldSchema = z.enum(["createdAt", "size", "mimeType", "fileName"]);
const sortOrderSchema = z.enum(["asc", "desc"]);
const statusSchema = z.enum([
  "all",
  "pending",
  "completed",
  "failed",
  "deleted",
]);

export const fileKeyRouter = {
  list: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        mimeType: z.string().optional(),
        environmentId: z.string().optional(),
        status: statusSchema.default("all"),
        sortBy: sortFieldSchema.default("createdAt"),
        sortOrder: sortOrderSchema.default("desc"),
      }),
    )
    .use(requirePermission({ fileKey: ["read"] }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { parentOrganizationId: true },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      if (project.parentOrganizationId !== ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }

      const conditions: SQL<unknown>[] = [
        eq(fileKeys.projectId, input.projectId),
      ];

      if (input.environmentId) {
        conditions.push(eq(fileKeys.environmentId, input.environmentId));
      }

      if (input.search) {
        conditions.push(ilike(fileKeys.fileName, `%${input.search}%`));
      }

      if (input.mimeType) {
        const mimeCondition = or(
          ilike(files.mimeType, `${input.mimeType}%`),
          ilike(fileKeys.claimedMimeType, `${input.mimeType}%`),
        );
        if (mimeCondition) conditions.push(mimeCondition);
      }

      if (input.status !== "all") {
        conditions.push(eq(fileKeys.status, input.status));
      }

      const whereClause = and(...conditions);

      const [countResult] = await ctx.db
        .select({ count: count() })
        .from(fileKeys)
        .leftJoin(files, eq(fileKeys.fileId, files.id))
        .where(whereClause);

      const totalCount = countResult?.count ?? 0;
      const totalPages = Math.ceil(totalCount / input.pageSize);
      const offset = (input.page - 1) * input.pageSize;

      const sortColumn = {
        createdAt: fileKeys.createdAt,
        size: sql`COALESCE(${files.size}, ${fileKeys.claimedSize})`,
        mimeType: sql`COALESCE(${files.mimeType}, ${fileKeys.claimedMimeType})`,
        fileName: fileKeys.fileName,
      }[input.sortBy];

      const orderBy =
        input.sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

      const results = await ctx.db
        .select({
          id: fileKeys.id,
          fileName: fileKeys.fileName,
          accessKey: fileKeys.accessKey,
          fileId: fileKeys.fileId,
          environmentId: fileKeys.environmentId,
          projectId: fileKeys.projectId,
          claimedHash: fileKeys.claimedHash,
          claimedMimeType: fileKeys.claimedMimeType,
          claimedSize: fileKeys.claimedSize,
          status: fileKeys.status,
          isPublic: fileKeys.isPublic,
          serveImage: fileKeys.serveImage,
          uploadCompletedAt: fileKeys.uploadCompletedAt,
          uploadFailedAt: fileKeys.uploadFailedAt,
          deletedAt: fileKeys.deletedAt,
          createdAt: fileKeys.createdAt,
          fileHash: files.hash,
          fileMimeType: files.mimeType,
          fileSize: files.size,
        })
        .from(fileKeys)
        .leftJoin(files, eq(fileKeys.fileId, files.id))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(input.pageSize)
        .offset(offset);

      const environmentIds = [...new Set(results.map((r) => r.environmentId))];
      const environments =
        environmentIds.length > 0
          ? await ctx.db.query.projectEnvironments.findMany({
              where: or(
                ...environmentIds.map((id) => eq(projectEnvironments.id, id)),
              ),
              columns: { id: true, name: true, type: true },
            })
          : [];

      const environmentMap = new Map(environments.map((e) => [e.id, e]));

      const fileKeyList = results.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        accessKey: r.accessKey,
        fileId: r.fileId,
        environmentId: r.environmentId,
        projectId: r.projectId,
        claimedHash: r.claimedHash,
        claimedMimeType: r.claimedMimeType,
        claimedSize: r.claimedSize,
        isPublic: r.isPublic,
        serveImage: r.serveImage,
        uploadCompletedAt: r.uploadCompletedAt,
        uploadFailedAt: r.uploadFailedAt,
        deletedAt: r.deletedAt,
        createdAt: r.createdAt,
        status: r.status,
        hash: r.fileHash ?? r.claimedHash,
        mimeType: r.fileMimeType ?? r.claimedMimeType,
        size: r.fileSize ?? r.claimedSize,
        environment: environmentMap.get(r.environmentId) ?? null,
      }));

      return {
        fileKeys: fileKeyList,
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

  getStats: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        environmentId: z.string().optional(),
      }),
    )
    .use(requirePermission({ fileKey: ["read"] }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { parentOrganizationId: true },
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

      const baseWhere = and(
        eq(fileKeys.projectId, input.projectId),
        ...(input.environmentId
          ? [eq(fileKeys.environmentId, input.environmentId)]
          : []),
      );

      // const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [stats] = await ctx.db
        .select({
          total: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) filter (where ${eq(fileKeys.status, "completed")})::int`,
          pending: sql<number>`count(*) filter (where ${eq(fileKeys.status, "pending")})::int`,
          // failed7d: sql<number>`count(*) filter (where ${and(eq(fileKeys.status, "failed"), gte(fileKeys.createdAt, sevenDaysAgo))})::int`,
          failed: sql<number>`count(*) filter (where ${eq(fileKeys.status, "failed")})::int`,
          deleted: sql<number>`count(*) filter (where ${eq(fileKeys.status, "deleted")})::int`,
        })
        .from(fileKeys)
        .where(baseWhere);

      const completedFileKeys = await ctx.db.query.fileKeys.findMany({
        where: and(baseWhere, eq(fileKeys.status, "completed")),
        with: { file: { columns: { size: true } } },
      });

      const totalSize = completedFileKeys.reduce(
        (sum, fk) => sum + (fk.file?.size ?? 0),
        0,
      );

      return {
        total: stats?.total ?? 0,
        completed: stats?.completed ?? 0,
        pending: stats?.pending ?? 0,
        failed: stats?.failed ?? 0,
        deleted: stats?.deleted ?? 0,
        totalSize,
      };
    }),

  getFilterOptions: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        environmentId: z.string().optional(),
      }),
    )
    .use(requirePermission({ fileKey: ["read"] }))
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

      const baseFileKeyFilters = [
        eq(fileKeys.projectId, input.projectId),
        ...(input.environmentId
          ? [eq(fileKeys.environmentId, input.environmentId)]
          : []),
      ];

      const [environments, completedMimeTypes, pendingMimeTypes] =
        await Promise.all([
          ctx.db.query.projectEnvironments.findMany({
            where: eq(projectEnvironments.projectId, input.projectId),
            columns: { id: true, name: true, type: true },
          }),
          ctx.db
            .select({ mimeType: files.mimeType })
            .from(fileKeys)
            .innerJoin(files, eq(fileKeys.fileId, files.id))
            .where(and(...baseFileKeyFilters)),
          ctx.db
            .select({ mimeType: fileKeys.claimedMimeType })
            .from(fileKeys)
            .where(
              and(
                ...baseFileKeyFilters,
                eq(fileKeys.status, "pending"),
                isNotNull(fileKeys.claimedMimeType),
              ),
            ),
        ]);

      const mimeTypeCategorySet = new Set<string>();

      for (const { mimeType } of completedMimeTypes) {
        const category = mimeType.split("/")[0];
        if (category) mimeTypeCategorySet.add(category);
      }

      for (const { mimeType } of pendingMimeTypes) {
        const category = mimeType?.split("/")[0];
        if (category) mimeTypeCategorySet.add(category);
      }

      const mimeTypeCategories = [...mimeTypeCategorySet].sort();

      return { environments, mimeTypeCategories };
    }),

  getById: organizationProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .use(requirePermission({ fileKey: ["read"] }))
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

      const fileKey = await ctx.db.query.fileKeys.findFirst({
        where: and(
          eq(fileKeys.id, input.id),
          eq(fileKeys.projectId, input.projectId),
        ),
        with: {
          file: true,
          environment: true,
        },
      });

      if (!fileKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "FileKey not found",
        });
      }

      return fileKey;
    }),

  updateAccess: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        environmentId: z.string(),
        isPublic: z.boolean(),
        serveImage: z.boolean().optional(),
      }),
    )
    .use(requirePermission({ fileKey: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (project?.parentOrganizationId !== ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }

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

      if (environment.projectId !== input.projectId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Environment does not belong to this project",
        });
      }

      const result = await updateFileKeyAccess(ctx.db, {
        projectId: input.projectId,
        fileKeyId: input.id,
        environmentId: environment.id,
        isPublic: input.isPublic,
        serveImage: input.serveImage,
        clientIp: ctx.clientIp,
      });

      if (result.status === "not_found") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "FileKey not found",
        });
      }

      if (result.status === "serve_image_invalid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.message,
        });
      }

      return result.fileKey;
    }),

  delete: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      }),
    )
    .use(requirePermission({ fileKey: ["delete"] }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (project?.parentOrganizationId !== ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }

      const fileKey = await ctx.db.query.fileKeys.findFirst({
        where: and(
          eq(fileKeys.id, input.id),
          eq(fileKeys.projectId, input.projectId),
        ),
      });

      if (!fileKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "FileKey not found",
        });
      }

      const transitionResult = await deleteFileKey(ctx.db, {
        projectId: input.projectId,
        fileKeyId: input.id,
        audit: {
          organizationId: ctx.organizationId,
          clientIp: ctx.clientIp,
          actor: buildUserAuditActor({
            userId: ctx.session.user.id,
            memberId: ctx.membership.id,
            name: ctx.session.user.name,
            email: ctx.session.user.email,
          }),
        },
      });

      if (transitionResult.status === "not_found") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "FileKey not found",
        });
      }

      if (transitionResult.status === "pending_rejected") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Pending uploads must be marked as failed instead of deleted",
        });
      }

      if (transitionResult.status === "already_deleted") {
        return {
          success: true,
          alreadyDeleted: true,
          lifecycleJobs: null,
        };
      }

      if (transitionResult.status === "deleted_without_cleanup") {
        return {
          success: true,
          alreadyDeleted: false,
          lifecycleJobs: null,
        };
      }

      const drainResult = await runLifecycleJobBatch(ctx.db, {
        limit: 20,
        leaseSeconds: 45,
        leaseOwner: "trpc:fileKey.delete",
      });

      return {
        success: true,
        alreadyDeleted: false,
        lifecycleJobs: {
          fileId: transitionResult.fileId,
          storageKey: transitionResult.storageKey,
          claimed: drainResult.claimed,
          completed: drainResult.completed,
          retried: drainResult.retried,
          dead: drainResult.dead,
        },
      };
    }),

  markFailed: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      }),
    )
    .use(requirePermission({ fileKey: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (project?.parentOrganizationId !== ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }

      const fileKey = await ctx.db.query.fileKeys.findFirst({
        where: and(
          eq(fileKeys.id, input.id),
          eq(fileKeys.projectId, input.projectId),
        ),
      });

      if (!fileKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "FileKey not found",
        });
      }

      try {
        const updated = await markUploadAsFailed(ctx.db, {
          projectId: input.projectId,
          environmentId: fileKey.environmentId,
          fileKeyId: input.id,
          error: "Manually marked as failed",
          clientIp: ctx.clientIp,
        });

        return updated;
      } catch (error) {
        if (error instanceof UploadFailureError) {
          throw new TRPCError({
            code: error.code === "NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  bulkDelete: organizationProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
        projectId: z.string(),
      }),
    )
    .use(requirePermission({ fileKey: ["delete"] }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { parentOrganizationId: true },
      });

      if (project?.parentOrganizationId !== ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }

      const matchedFileKeys = await ctx.db.query.fileKeys.findMany({
        where: and(
          inArray(fileKeys.id, input.ids),
          eq(fileKeys.projectId, input.projectId),
        ),
      });

      let succeeded = 0;
      let failed = 0;
      let requiresCleanupDrain = false;
      const deletedFileKeyIds: Record<string, string> = {};
      const actor = buildUserAuditActor({
        userId: ctx.session.user.id,
        memberId: ctx.membership.id,
        name: ctx.session.user.name,
        email: ctx.session.user.email,
      });

      if (matchedFileKeys.length === 1) {
        const matchedFileKey = matchedFileKeys[0];

        if (!matchedFileKey) {
          return { succeeded: 0, failed: input.ids.length };
        }

        const result = await deleteFileKey(ctx.db, {
          projectId: input.projectId,
          fileKeyId: matchedFileKey.id,
          audit: {
            organizationId: ctx.organizationId,
            clientIp: ctx.clientIp,
            actor,
          },
        });

        if (result.status === "already_deleted") {
          succeeded++;
        } else if (
          result.status === "pending_rejected" ||
          result.status === "not_found"
        ) {
          failed++;
        } else {
          if (result.status === "deleted_with_cleanup") {
            requiresCleanupDrain = true;
          }

          succeeded++;
        }

        failed += input.ids.length - matchedFileKeys.length;

        if (requiresCleanupDrain) {
          await runLifecycleJobBatch(ctx.db, {
            limit: 50,
            leaseSeconds: 45,
            leaseOwner: "trpc:fileKey.bulkDelete",
          });
        }

        return { succeeded, failed };
      }

      for (const fk of matchedFileKeys) {
        const result = await deleteFileKey(ctx.db, {
          projectId: input.projectId,
          fileKeyId: fk.id,
          audit: {
            organizationId: ctx.organizationId,
            clientIp: ctx.clientIp,
            actor,
            recordAuditEvent: false,
          },
        });

        if (result.status === "already_deleted") {
          succeeded++;
          continue;
        }

        if (
          result.status === "pending_rejected" ||
          result.status === "not_found"
        ) {
          failed++;
          continue;
        }

        if (result.status === "deleted_with_cleanup") {
          requiresCleanupDrain = true;
        }

        // deletedFileKeyIds.push(fk.id);
        deletedFileKeyIds[fk.id] = fk.fileName;
        succeeded++;
      }

      failed += input.ids.length - matchedFileKeys.length;

      const numDeleted = Object.keys(deletedFileKeyIds).length;
      if (numDeleted > 0) {
        await recordAuditEvent(ctx.db, {
          organizationId: ctx.organizationId,
          projectId: input.projectId,
          clientIp: ctx.clientIp,
          eventCode: auditEventCodes.fileDeleted,
          eventCategory: "lifecycle",
          resourceType: "file",
          resourceLabel: `${numDeleted} files`,
          status: "success",
          summary: `Bulk file deletion completed for ${numDeleted} files`,
          metadata: {
            bulk: true,
            matchedCount: matchedFileKeys.length,
            deletedCount: numDeleted,
            failedCount: failed,
            fileKeyIds: deletedFileKeyIds,
          },
          ...actor,
        });
      }

      if (requiresCleanupDrain) {
        await runLifecycleJobBatch(ctx.db, {
          limit: 50,
          leaseSeconds: 45,
          leaseOwner: "trpc:fileKey.bulkDelete",
        });
      }

      return { succeeded, failed };
    }),

  bulkMarkFailed: organizationProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
        projectId: z.string(),
      }),
    )
    .use(requirePermission({ fileKey: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { parentOrganizationId: true },
      });

      if (project?.parentOrganizationId !== ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }

      const matchedFileKeys = await ctx.db.query.fileKeys.findMany({
        where: and(
          inArray(fileKeys.id, input.ids),
          eq(fileKeys.projectId, input.projectId),
        ),
      });

      let succeeded = 0;
      let failed = 0;
      const failedFileKeyIds: string[] = [];
      const actor = buildUserAuditActor({
        userId: ctx.session.user.id,
        memberId: ctx.membership.id,
        name: ctx.session.user.name,
        email: ctx.session.user.email,
      });

      if (matchedFileKeys.length === 1) {
        const matchedFileKey = matchedFileKeys[0];

        if (!matchedFileKey) {
          return { succeeded: 0, failed: input.ids.length };
        }

        try {
          await markUploadAsFailed(ctx.db, {
            projectId: input.projectId,
            environmentId: matchedFileKey.environmentId,
            fileKeyId: matchedFileKey.id,
            error: "Manually marked as failed",
            actor,
            clientIp: ctx.clientIp,
          });
          succeeded++;
        } catch {
          failed++;
        }

        failed += input.ids.length - matchedFileKeys.length;

        return { succeeded, failed };
      }

      for (const fk of matchedFileKeys) {
        try {
          await markUploadAsFailed(ctx.db, {
            projectId: input.projectId,
            environmentId: fk.environmentId,
            fileKeyId: fk.id,
            error: "Manually marked as failed",
            actor,
            clientIp: ctx.clientIp,
            recordAuditEvent: false,
          });
          failedFileKeyIds.push(fk.id);
          succeeded++;
        } catch {
          failed++;
        }
      }

      failed += input.ids.length - matchedFileKeys.length;

      if (failedFileKeyIds.length > 0) {
        await recordAuditEvent(ctx.db, {
          organizationId: ctx.organizationId,
          projectId: input.projectId,
          clientIp: ctx.clientIp,
          eventCode: auditEventCodes.fileUploadFailed,
          eventCategory: "operational",
          resourceType: "file",
          resourceLabel: `${failedFileKeyIds.length} files`,
          status: "success",
          summary: `Bulk upload failure marked for ${failedFileKeyIds.length} files`,
          metadata: {
            bulk: true,
            matchedCount: matchedFileKeys.length,
            failedUploadCount: failedFileKeyIds.length,
            failedCount: failed,
            fileKeyIds: failedFileKeyIds,
          },
          ...actor,
        });
      }

      return { succeeded, failed };
    }),

  bulkUpdateAccess: organizationProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
        projectId: z.string(),
        isPublic: z.boolean(),
      }),
    )
    .use(requirePermission({ fileKey: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { parentOrganizationId: true },
      });

      if (project?.parentOrganizationId !== ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }

      const matchedFileKeys = await ctx.db.query.fileKeys.findMany({
        where: and(
          inArray(fileKeys.id, input.ids),
          eq(fileKeys.projectId, input.projectId),
        ),
        columns: {
          id: true,
          isPublic: true,
          environmentId: true,
        },
      });

      if (matchedFileKeys.length === 0) {
        return { updated: 0 };
      }

      const actor = buildUserAuditActor({
        userId: ctx.session.user.id,
        memberId: ctx.membership.id,
        name: ctx.session.user.name,
        email: ctx.session.user.email,
      });
      const fileKeysToChange = matchedFileKeys.filter(
        (fileKey) => fileKey.isPublic !== input.isPublic,
      );

      if (matchedFileKeys.length === 1) {
        const matchedFileKey = matchedFileKeys[0];

        if (!matchedFileKey) {
          return { updated: 0 };
        }

        await updateFileKeyAccess(ctx.db, {
          projectId: input.projectId,
          fileKeyId: matchedFileKey.id,
          environmentId: matchedFileKey.environmentId,
          isPublic: input.isPublic,
          actor,
          clientIp: ctx.clientIp,
        });

        return { updated: matchedFileKeys.length };
      }

      const result = await ctx.db.transaction(async (tx) => {
        const updated = await tx
          .update(fileKeys)
          .set({ isPublic: input.isPublic })
          .where(
            and(
              inArray(fileKeys.id, input.ids),
              eq(fileKeys.projectId, input.projectId),
            ),
          )
          .returning({ id: fileKeys.id });

        if (fileKeysToChange.length > 1) {
          await recordAuditEvent(tx, {
            organizationId: ctx.organizationId,
            projectId: input.projectId,
            clientIp: ctx.clientIp,
            eventCode: auditEventCodes.fileKeyAccessUpdated,
            eventCategory: "lifecycle",
            resourceType: "file_key",
            resourceLabel: `${fileKeysToChange.length} file keys`,
            status: "success",
            summary: `Bulk file key access updated for ${fileKeysToChange.length} file keys`,
            changes: [
              {
                path: "isPublic",
                before: "mixed",
                after: input.isPublic,
              },
            ],
            metadata: {
              bulk: true,
              matchedCount: matchedFileKeys.length,
              updatedCount: fileKeysToChange.length,
              fileKeyIds: fileKeysToChange.map((fileKey) => fileKey.id),
              isPublic: input.isPublic,
            },
            ...actor,
          });
        }

        return updated;
      });

      return { updated: result.length };
    }),
} satisfies TRPCRouterRecord;
