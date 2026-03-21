import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { files, projects } from "@silo-storage/db/schema";

import { organizationProcedure, requirePermission } from "../trpc";

export const fileRouter = {
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

      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.id),
          eq(files.projectId, input.projectId),
        ),
        with: {
          environment: true,
          fileKeys: true,
        },
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      return file;
    }),
} satisfies TRPCRouterRecord;
