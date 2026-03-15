import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { fileAccessTypes } from "@silo-storage/db/schema";

import {
  checkProjectSlugAvailability,
  createProject,
  getProjectById,
  listProjects,
  updateProject,
} from "../service/project";
import { organizationProcedure } from "../trpc";

export const projectRouter = {
  list: organizationProcedure.query(async ({ ctx }) => {
    return listProjects(ctx.db, ctx.organizationId);
  }),

  getById: organizationProcedure
    .input(z.object({ id: z.string() }))
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

  checkSlug: organizationProcedure
    .input(
      z.object({
        slug: z.string().trim().min(1).max(63),
      }),
    )
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
        defaultFileAccess: z.enum(fileAccessTypes.enumValues).optional(),
        pendingUploadFailAfterHours: z
          .number()
          .int()
          .min(1)
          .max(720)
          .optional(),
      }),
    )
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

      return updateProject(ctx.db, {
        id: input.id,
        name: input.name,
        defaultFileAccess: input.defaultFileAccess,
        pendingUploadFailAfterHours: input.pendingUploadFailAfterHours,
      });
    }),
} satisfies TRPCRouterRecord;
