import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  buildAuditChanges,
  buildUserAuditActor,
  recordAuditEvent,
} from "../service/audit";
import {
  checkProjectSlugAvailability,
  createProject,
  deleteProject,
  getProjectById,
  getProjectBySlug,
  listProjects,
  updateProject,
} from "../service/project";
import { organizationProcedure, requirePermission } from "../trpc";

export const projectRouter = {
  list: organizationProcedure
    .use(requirePermission({ project: ["read"] }))
    .query(async ({ ctx }) => {
      return listProjects(ctx.db, ctx.organizationId);
    }),

  getById: organizationProcedure
    .input(z.object({ id: z.string() }))
    .use(requirePermission({ project: ["read"] }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectById(ctx.db, input.id);

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

      return project;
    }),

  getBySlug: organizationProcedure
    .input(z.object({ slug: z.string() }))
    .use(requirePermission({ project: ["read"] }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectBySlug(ctx.db, input.slug);

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

      return project;
    }),

  checkSlug: organizationProcedure
    .input(
      z.object({
        slug: z.string().trim().min(1).max(63),
      }),
    )
    .use(requirePermission({ project: ["read"] }))
    .query(({ ctx, input }) => {
      return checkProjectSlugAvailability(ctx.db, input.slug);
    }),

  create: organizationProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(100),
        slug: z.string().trim().min(1, "Slug is required").max(63),
      }),
    )
    .use(requirePermission({ project: ["create"] }))
    .mutation(async ({ ctx, input }) => {
      const slugCheck = await checkProjectSlugAvailability(ctx.db, input.slug);

      if (!slugCheck.available) {
        if (slugCheck.reason === "taken") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This project slug is already taken",
          });
        }

        if (slugCheck.reason === "reserved") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This project slug is reserved",
          });
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Project slug must be 3-63 characters, lowercase, and contain only letters, numbers, and hyphens",
        });
      }

      return createProject(ctx.db, {
        name: input.name,
        slug: input.slug,
        organizationId: ctx.organizationId,
      });
    }),

  update: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        defaultFileAccess: z.enum(["public", "private"]).optional(),
        imageDeliveryPolicy: z
          .enum(["disabled", "public_only", "public_and_private_opt_in"])
          .optional(),
        defaultServeImage: z.boolean().optional(),
        preserveImageExif: z.boolean().optional(),
        pendingUploadFailAfterMinutes: z
          .number()
          .int()
          .min(5)
          .max(43200)
          .optional(),
        auditLogRetentionDays: z.number().int().min(1).max(3650).optional(),
        usageEventRetentionDays: z.number().int().min(1).max(3650).optional(),
        auditLogDownloadPolicy: z
          .enum(["disabled", "always", "signed_only"])
          .optional(),
      }),
    )
    .use(requirePermission({ project: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(ctx.db, input.id);

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

      const updated = await updateProject(ctx.db, {
        id: input.id,
        name: input.name,
        defaultFileAccess: input.defaultFileAccess,
        imageDeliveryPolicy: input.imageDeliveryPolicy,
        defaultServeImage: input.defaultServeImage,
        preserveImageExif: input.preserveImageExif,
        pendingUploadFailAfterHours: input.pendingUploadFailAfterMinutes,
        auditLogRetentionDays: input.auditLogRetentionDays,
        usageEventRetentionDays: input.usageEventRetentionDays,
        auditLogDownloadPolicy: input.auditLogDownloadPolicy,
      });

      if (updated) {
        const changes = buildAuditChanges(
          {
            name: project.name,
            defaultFileAccess: project.defaultFileAccess,
            imageDeliveryPolicy: project.imageDeliveryPolicy,
            defaultServeImage: project.defaultServeImage,
            preserveImageExif: project.preserveImageExif,
            pendingUploadFailAfterMinutes:
              project.pendingUploadFailAfterMinutes,
            auditLogRetentionDays: project.auditLogRetentionDays,
            usageEventRetentionDays: project.usageEventRetentionDays,
            auditLogDownloadPolicy: project.auditLogDownloadPolicy,
          },
          {
            name: updated.name,
            defaultFileAccess: updated.defaultFileAccess,
            imageDeliveryPolicy: updated.imageDeliveryPolicy,
            defaultServeImage: updated.defaultServeImage,
            preserveImageExif: updated.preserveImageExif,
            pendingUploadFailAfterMinutes:
              updated.pendingUploadFailAfterMinutes,
            auditLogRetentionDays: updated.auditLogRetentionDays,
            usageEventRetentionDays: updated.usageEventRetentionDays,
            auditLogDownloadPolicy: updated.auditLogDownloadPolicy,
          },
        );

        if (changes.length > 0) {
          await recordAuditEvent(ctx.db, {
            organizationId: ctx.organizationId,
            projectId: updated.id,
            clientIp: ctx.clientIp,
            ...buildUserAuditActor({
              userId: ctx.session.user.id,
              memberId: ctx.membership.id,
              name: ctx.session.user.name,
              email: ctx.session.user.email,
            }),
            eventCode: "project.settings.updated",
            eventCategory: "configuration",
            resourceType: "project",
            resourceId: updated.id,
            resourceLabel: updated.name,
            summary: "Project settings updated",
            changes,
            metadata: {
              slug: updated.slug,
            },
          });
        }
      }

      return updated;
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .use(requirePermission({ project: ["delete"] }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(ctx.db, input.id);
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
      const deleted = await deleteProject(input.id);

      if (deleted) {
        await recordAuditEvent(ctx.db, {
          organizationId: ctx.organizationId,
          projectId: null,
          clientIp: ctx.clientIp,
          ...buildUserAuditActor({
            userId: ctx.session.user.id,
            memberId: ctx.membership.id,
            name: ctx.session.user.name,
            email: ctx.session.user.email,
          }),
          eventCode: "project.deleted",
          eventCategory: "lifecycle",
          resourceType: "project",
          resourceId: input.id,
          resourceLabel: project.name,
          summary: "Project deleted",
          metadata: {
            slug: project.slug,
          },
        });
      }

      return deleted;
    }),
} satisfies TRPCRouterRecord;
