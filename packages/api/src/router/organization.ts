import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, asc, desc, eq } from "@silo-storage/db";
import { invitations, members, organizations, users } from "@silo-storage/db/schema";

import {
  organizationProcedure,
  protectedProcedure,
  requirePermission,
} from "../trpc";

export const organizationRouter = {
  /**
   * Get an organization by its slug
   * Also verifies that the current user is a member
   */
  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.slug, input.slug),
      });

      if (!org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      // Check if user is a member
      const membership = await ctx.db.query.members.findFirst({
        where: and(
          eq(members.organizationId, org.id),
          eq(members.userId, ctx.session.user.id),
        ),
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      return {
        ...org,
        membership,
      };
    }),

  /**
   * Get the current user's role in the specified organization
   */
  getMyRole: organizationProcedure.query(({ ctx }) => {
    return {
      role: ctx.membership.role,
      memberId: ctx.membership.id,
    };
  }),

  /**
   * Get pending invitations for the specified organization
   * Only returns invitations if user is admin/owner
   */
  getPendingInvitations: organizationProcedure
    .use(
      requirePermission(
        { invitation: ["read"] },
        "Only admins and owners can view invitations",
      ),
    )
    .query(async ({ ctx }) => {
      // Fetch invitations with inviter info using a join
      const pendingInvitations = await ctx.db
        .select({
          id: invitations.id,
          email: invitations.email,
          role: invitations.role,
          status: invitations.status,
          expiresAt: invitations.expiresAt,
          createdAt: invitations.createdAt,
          inviterName: users.name,
          inviterEmail: users.email,
        })
        .from(invitations)
        .innerJoin(users, eq(invitations.inviterId, users.id))
        .where(
          and(
            eq(invitations.organizationId, ctx.organizationId),
            eq(invitations.status, "pending"),
          ),
        )
        .orderBy(desc(invitations.createdAt));

      return pendingInvitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        inviter: {
          name: inv.inviterName,
          email: inv.inviterEmail,
        },
      }));
    }),

  /**
   * Get all members with user details for the specified organization
   */
  getMembers: organizationProcedure.query(async ({ ctx }) => {
    // Fetch members with user info using a join
    const memberList = await ctx.db
      .select({
        id: members.id,
        role: members.role,
        createdAt: members.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(eq(members.organizationId, ctx.organizationId))
      .orderBy(asc(members.createdAt));

    return memberList.map((m) => ({
      id: m.id,
      role: m.role,
      createdAt: m.createdAt,
      user: {
        id: m.userId,
        name: m.userName,
        email: m.userEmail,
        image: m.userImage,
      },
    }));
  }),
} satisfies TRPCRouterRecord;
