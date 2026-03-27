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
import { clearUploadSessionAdapterData } from "@silo-storage/shared";

import {
  enqueueDeleteObjectJob,
  enqueueFinalizeFailedFileKeyJob,
  markUploadAsFailed,
  runLifecycleJobBatch,
  UploadFailureError,
} from "../service";
import { organizationProcedure, requirePermission } from "../trpc";

const sortFieldSchema = z.enum(["createdAt", "size", "mimeType", "fileName"]);
const sortOrderSchema = z.enum(["asc", "desc"]);
const statusSchema = z.enum(["all", "pending", "completed", "failed"]);

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

      if (input.status === "pending") {
        conditions.push(eq(fileKeys.status, "pending"));
      } else if (input.status === "completed") {
        conditions.push(eq(fileKeys.status, "completed"));
      } else if (input.status === "failed") {
        conditions.push(eq(fileKeys.status, "failed"));
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
          uploadCompletedAt: fileKeys.uploadCompletedAt,
          uploadFailedAt: fileKeys.uploadFailedAt,
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
        uploadCompletedAt: r.uploadCompletedAt,
        uploadFailedAt: r.uploadFailedAt,
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

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(fileKeys)
        .where(baseWhere);

      const [completedResult] = await ctx.db
        .select({ count: count() })
        .from(fileKeys)
        .where(and(baseWhere, eq(fileKeys.status, "completed")));

      const [pendingResult] = await ctx.db
        .select({ count: count() })
        .from(fileKeys)
        .where(and(baseWhere, eq(fileKeys.status, "pending")));

      const [failedResult] = await ctx.db
        .select({ count: count() })
        .from(fileKeys)
        .where(and(baseWhere, eq(fileKeys.status, "failed")));

      const completedFileKeys = await ctx.db.query.fileKeys.findMany({
        where: and(baseWhere, eq(fileKeys.status, "completed")),
        with: { file: { columns: { size: true } } },
      });

      const totalSize = completedFileKeys.reduce(
        (sum, fk) => sum + (fk.file?.size ?? 0),
        0,
      );

      return {
        total: totalResult?.count ?? 0,
        completed: completedResult?.count ?? 0,
        pending: pendingResult?.count ?? 0,
        failed: failedResult?.count ?? 0,
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

      const environments = await ctx.db.query.projectEnvironments.findMany({
        where: eq(projectEnvironments.projectId, input.projectId),
        columns: { id: true, name: true, type: true },
      });

      const completedFileKeys = await ctx.db
        .select({ mimeType: files.mimeType })
        .from(fileKeys)
        .innerJoin(files, eq(fileKeys.fileId, files.id))
        .where(
          and(
            eq(fileKeys.projectId, input.projectId),
            ...(input.environmentId
              ? [eq(fileKeys.environmentId, input.environmentId)]
              : []),
          ),
        );

      const pendingFileKeys = await ctx.db
        .select({ mimeType: fileKeys.claimedMimeType })
        .from(fileKeys)
        .where(
          and(
            eq(fileKeys.projectId, input.projectId),
            ...(input.environmentId
              ? [eq(fileKeys.environmentId, input.environmentId)]
              : []),
            eq(fileKeys.status, "pending"),
            isNotNull(fileKeys.claimedMimeType),
          ),
        );

      const allMimeTypes = [
        ...completedFileKeys.map((r) => r.mimeType),
        ...pendingFileKeys.map((r) => r.mimeType).filter(Boolean),
      ];

      const mimeTypeCategories = [
        ...new Set(allMimeTypes.map((mt) => mt?.split("/")[0]).filter(Boolean)),
      ].sort() as string[];

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
        isPublic: z.boolean(),
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

      const [updated] = await ctx.db
        .update(fileKeys)
        .set({ isPublic: input.isPublic })
        .where(eq(fileKeys.id, input.id))
        .returning();

      return updated;
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
        with: { file: true },
      });

      if (!fileKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "FileKey not found",
        });
      }

      if (!fileKey.file && fileKey.status === "failed") {
        return {
          success: true,
          alreadyDeleted: true,
        };
      }

      if (!fileKey.file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File has not been uploaded yet",
        });
      }

      const transitionResult = await ctx.db.transaction(async (tx) => {
        const current = await tx.query.fileKeys.findFirst({
          where: and(
            eq(fileKeys.id, input.id),
            eq(fileKeys.projectId, input.projectId),
          ),
          with: { file: true },
        });

        if (!current) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "FileKey not found",
          });
        }

        if (!current.file) {
          return {
            alreadyDeleted: current.status === "failed",
            fileId: null,
            storageKey: null,
          };
        }

        await tx
          .update(fileKeys)
          .set({
            status: "failed",
            uploadFailedAt: new Date(),
            adapterData: clearUploadSessionAdapterData(current.adapterData),
          })
          .where(eq(fileKeys.id, current.id));

        await enqueueDeleteObjectJob(tx, {
          projectId: input.projectId,
          environmentId: current.environmentId,
          fileKeyId: current.id,
          fileId: current.file.id,
          storageKey: current.file.storageKey,
          priority: 120,
        });

        await enqueueFinalizeFailedFileKeyJob(tx, {
          projectId: input.projectId,
          environmentId: current.environmentId,
          fileKeyId: current.id,
          fileId: current.file.id,
          priority: 100,
        });

        return {
          alreadyDeleted: false,
          fileId: current.file.id,
          storageKey: current.file.storageKey,
        };
      });

      if (transitionResult.alreadyDeleted) {
        return {
          success: true,
          alreadyDeleted: true,
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
} satisfies TRPCRouterRecord;
