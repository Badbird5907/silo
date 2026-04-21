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
  updateEnvironmentCallbackHeaders,
  updateEnvironmentWebhookConfig,
} from "../service/environment";
import {
  buildAuditChanges,
  buildHeaderAuditChanges,
  buildUserAuditActor,
  normalizeUrlValue,
  recordAuditEvent,
} from "../service/audit";
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

      const created = await createEnvironment(ctx.db, {
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        ownerUserId: input.ownerUserId,
        slug: input.slug,
      });

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create environment",
        });
      }

      await recordAuditEvent(ctx.db, {
        organizationId: ctx.organizationId,
        projectId: created.projectId,
        environmentId: created.id,
        ...buildUserAuditActor({
          userId: ctx.session.user.id,
          memberId: ctx.membership.id,
          name: ctx.session.user.name,
          email: ctx.session.user.email,
        }),
        eventCode: "environment.created",
        eventCategory: "configuration",
        resourceType: "environment",
        resourceId: created.id,
        resourceLabel: created.name,
        summary: "Environment created",
        metadata: {
          type: created.type,
          slug: created.slug,
          ownerUserId: created.ownerUserId,
        },
      });

      return created;
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
      const created = await createPersonalDevelopmentEnvironment(ctx.db, {
        projectId: input.projectId,
        userId: ctx.session.user.id,
        preferredName: input.preferredName,
        userName: ctx.session.user.name,
      });

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create environment",
        });
      }

      await recordAuditEvent(ctx.db, {
        organizationId: ctx.organizationId,
        projectId: created.projectId,
        environmentId: created.id,
        ...buildUserAuditActor({
          userId: ctx.session.user.id,
          memberId: ctx.membership.id,
          name: ctx.session.user.name,
          email: ctx.session.user.email,
        }),
        eventCode: "environment.created",
        eventCategory: "configuration",
        resourceType: "environment",
        resourceId: created.id,
        resourceLabel: created.name,
        summary: "Environment created",
        metadata: {
          type: created.type,
          slug: created.slug,
          ownerUserId: created.ownerUserId,
          personalDevelopment: true,
        },
      });

      return created;
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
      const environment = await validateEnvironmentAccess(
        ctx.db,
        input.id,
        ctx.organizationId,
      );

      const updated = await updateEnvironment(ctx.db, {
        id: input.id,
        name: input.name,
        type: input.type,
      });

      if (updated) {
        const changes = buildAuditChanges(
          {
            name: environment.name,
            type: environment.type,
            slug: environment.slug,
          },
          {
            name: updated.name,
            type: updated.type,
            slug: updated.slug,
          },
        );

        if (changes.length > 0) {
          await recordAuditEvent(ctx.db, {
            organizationId: ctx.organizationId,
            projectId: updated.projectId ?? null,
            environmentId: updated.id,
            ...buildUserAuditActor({
              userId: ctx.session.user.id,
              memberId: ctx.membership.id,
              name: ctx.session.user.name,
              email: ctx.session.user.email,
            }),
            eventCode: "environment.updated",
            eventCategory: "configuration",
            resourceType: "environment",
            resourceId: updated.id,
            resourceLabel: updated.name,
            summary: "Environment updated",
            changes,
          });
        }
      }

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
      const environment = await validateEnvironmentAccess(
        ctx.db,
        input.id,
        ctx.organizationId,
      );
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

      const changes = buildAuditChanges(
        {
          webhookEnabled: environment.webhookEnabled,
          webhookUrl: normalizeUrlValue(environment.webhookUrl),
          webhookEvents: environment.webhookEvents,
        },
        {
          webhookEnabled: updated.webhookEnabled,
          webhookUrl: normalizeUrlValue(updated.webhookUrl),
          webhookEvents: updated.webhookEvents,
        },
      );

      if (changes.length > 0) {
        await recordAuditEvent(ctx.db, {
          organizationId: ctx.organizationId,
          projectId: updated.projectId ?? null,
          environmentId: updated.id,
          ...buildUserAuditActor({
            userId: ctx.session.user.id,
            memberId: ctx.membership.id,
            name: ctx.session.user.name,
            email: ctx.session.user.email,
          }),
          eventCode: "environment.webhook.updated",
          eventCategory: "configuration",
          resourceType: "environment",
          resourceId: updated.id,
          resourceLabel: updated.name,
          summary: "Webhook settings updated",
          changes,
        });
      }

      return toPublicEnvironment(updated);
    }),

  rotateWebhookSecret: organizationProcedure
    .input(z.object({ id: z.string() }))
    .use(requirePermission({ environment: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      const environment = await validateEnvironmentAccess(
        ctx.db,
        input.id,
        ctx.organizationId,
      );
      const result = await rotateEnvironmentWebhookSecret(ctx.db, input.id);

      if (!result.environment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment not found",
        });
      }

      await recordAuditEvent(ctx.db, {
        organizationId: ctx.organizationId,
        projectId: result.environment.projectId ?? null,
        environmentId: result.environment.id,
        ...buildUserAuditActor({
          userId: ctx.session.user.id,
          memberId: ctx.membership.id,
          name: ctx.session.user.name,
          email: ctx.session.user.email,
        }),
        eventCode: "environment.webhook_secret.rotated",
        eventCategory: "security",
        resourceType: "environment",
        resourceId: result.environment.id,
        resourceLabel: result.environment.name,
        summary: "Webhook secret rotated",
        metadata: {
          previousSecretSet: !!environment.webhookSecret,
        },
      });

      return {
        ...toPublicEnvironment(result.environment),
        webhookSecret: result.secret,
      };
    }),
  
  updateCallbackHeaders: organizationProcedure
    .input(z.object({ id: z.string(), headers: z.record(z.string(), z.string()) }))
    .use(requirePermission({ environment: ["update"] }))
    .mutation(async ({ ctx, input }) => {
      const environment = await validateEnvironmentAccess(
        ctx.db,
        input.id,
        ctx.organizationId,
      );
      const updated = await updateEnvironmentCallbackHeaders(
        ctx.db,
        input.id,
        input.headers,
      );
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment not found",
        });
      }

      const changes = buildHeaderAuditChanges(
        environment.callbackHeaders,
        updated.callbackHeaders,
      );

      if (changes.length > 0) {
        await recordAuditEvent(ctx.db, {
          organizationId: ctx.organizationId,
          projectId: updated.projectId ?? null,
          environmentId: updated.id,
          ...buildUserAuditActor({
            userId: ctx.session.user.id,
            memberId: ctx.membership.id,
            name: ctx.session.user.name,
            email: ctx.session.user.email,
          }),
          eventCode: "environment.callback_headers.updated",
          eventCategory: "security",
          resourceType: "environment",
          resourceId: updated.id,
          resourceLabel: updated.name,
          summary: "Callback headers updated",
          changes,
        });
      }

      return toPublicEnvironment(updated);
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

      const deleted = await deleteEnvironment(ctx.db, input.id, environment.projectId);

      if (deleted) {
        await recordAuditEvent(ctx.db, {
          organizationId: ctx.organizationId,
          projectId: environment.projectId,
          environmentId: input.id,
          ...buildUserAuditActor({
            userId: ctx.session.user.id,
            memberId: ctx.membership.id,
            name: ctx.session.user.name,
            email: ctx.session.user.email,
          }),
          eventCode: "environment.deleted",
          eventCategory: "lifecycle",
          resourceType: "environment",
          resourceId: input.id,
          resourceLabel: environment.name,
          summary: "Environment deleted",
          metadata: {
            slug: environment.slug,
            type: environment.type,
          },
        });
      }

      return deleted;
    }),
} satisfies TRPCRouterRecord;
