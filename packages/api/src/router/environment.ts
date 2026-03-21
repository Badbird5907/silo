import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq } from "@silo-storage/db";
import {  projects } from "@silo-storage/db/schema";

import {
  createEnvironment,
  createPersonalDevelopmentEnvironment,
  deleteEnvironment,
  getEnvironmentById,
  listEnvironments,
  rotateEnvironmentWebhookSecret,
  updateEnvironment,
  updateEnvironmentWebhookConfig,
} from "../service/environment";
import { organizationProcedure, requirePermission } from "../trpc";

/** Validate that a project belongs to the caller's organization. */
async function validateProjectAccess(
  db: Parameters<typeof listEnvironments>[0],
  projectId: string,
  organizationId: string,
) {
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.parentOrganizationId, organizationId),
    ),
  });

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found",
    });
  }

  return project;
}

const webhookEventsSchema = z.enum(["upload.completed", "upload.failed"]);

function toPublicEnvironment<
  T extends {
    webhookSecret?: string | null;
  },
>(environment: T) {
  const { webhookSecret, ...rest } = environment;
  return {
    ...rest,
    webhookSecretSet: !!webhookSecret,
  };
}

/** Validate that an environment belongs to a project owned by the caller's organization. */
async function validateEnvironmentAccess(
  db: Parameters<typeof listEnvironments>[0],
  environmentId: string,
  organizationId: string,
) {
  const environment = await getEnvironmentById(db, environmentId);

  if (!environment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Environment not found",
    });
  }

  if (!environment.projectId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Environment is missing a project reference",
    });
  }

  await validateProjectAccess(db, environment.projectId, organizationId);

  return environment;
}

export const environmentRouter = {
  list: organizationProcedure
    .input(z.object({ projectId: z.string() }))
    .use(requirePermission({ environment: ["read"] }))
    .query(async ({ ctx, input }) => {
      await validateProjectAccess(ctx.db, input.projectId, ctx.organizationId);
      const environments = await listEnvironments(ctx.db, input.projectId);
      return environments.map((environment) => ({
        ...toPublicEnvironment(environment),
        isPersonalDev:
          environment.type === "development" && !!environment.ownerUserId,
      }));
    }),

  getById: organizationProcedure
    .input(z.object({ id: z.string() }))
    .use(requirePermission({ environment: ["read"] }))
    .query(async ({ ctx, input }) => {
      const environment = await validateEnvironmentAccess(
        ctx.db,
        input.id,
        ctx.organizationId,
      );
      return toPublicEnvironment(environment);
    }),

  create: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1, "Name is required").max(100),
        type: z.enum(["development", "staging", "production"]),
        ownerUserId: z.string().optional(),
        slug: z.string().optional(),
      }),
    )
    .use(requirePermission({ environment: ["create"] }))
    .mutation(async ({ ctx, input }) => {
      await validateProjectAccess(ctx.db, input.projectId, ctx.organizationId);

      return createEnvironment(ctx.db, {
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        ownerUserId: input.ownerUserId,
        slug: input.slug,
      });
    }),

  createPersonal: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        preferredName: z.string().min(1).max(100).optional(),
      }),
    )
    .use(requirePermission({ personalEnvironment: ["create"] }))
    .mutation(async ({ ctx, input }) => {
      await validateProjectAccess(ctx.db, input.projectId, ctx.organizationId);
      return createPersonalDevelopmentEnvironment(ctx.db, {
        projectId: input.projectId,
        userId: ctx.session.user.id,
        preferredName: input.preferredName,
        userName: ctx.session.user.name,
      });
    }),

  update: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        type: z.enum(["development", "staging", "production"]).optional(),
      }),
    )
    .use(requirePermission({ environment: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      await validateEnvironmentAccess(ctx.db, input.id, ctx.organizationId);

      const updated = await updateEnvironment(ctx.db, {
        id: input.id,
        name: input.name,
        type: input.type,
      });
      return updated ? toPublicEnvironment(updated) : updated;
    }),

  updateWebhook: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        enabled: z.boolean().optional(),
        webhookUrl: z.url().nullable().optional(),
        webhookEvents: z.array(webhookEventsSchema).min(1).optional(),
      }),
    )
    .use(requirePermission({ environment: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      await validateEnvironmentAccess(ctx.db, input.id, ctx.organizationId);
      const updated = await updateEnvironmentWebhookConfig(ctx.db, {
        environmentId: input.id,
        enabled: input.enabled,
        webhookUrl: input.webhookUrl,
        webhookEvents: input.webhookEvents,
      });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment not found",
        });
      }

      return toPublicEnvironment(updated);
    }),

  rotateWebhookSecret: organizationProcedure
    .input(z.object({ id: z.string() }))
    .use(requirePermission({ environment: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      await validateEnvironmentAccess(ctx.db, input.id, ctx.organizationId);
      const result = await rotateEnvironmentWebhookSecret(ctx.db, input.id);

      if (!result.environment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment not found",
        });
      }

      return {
        ...toPublicEnvironment(result.environment),
        webhookSecret: result.secret,
      };
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .use(requirePermission({ environment: ["delete"] }))
    .mutation(async ({ ctx, input }) => {
      const environment = await validateEnvironmentAccess(
        ctx.db,
        input.id,
        ctx.organizationId,
      );
      if (!environment.projectId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Environment is missing a project reference",
        });
      }

      return deleteEnvironment(ctx.db, input.id, environment.projectId);
    }),
} satisfies TRPCRouterRecord;
