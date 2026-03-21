"use client";

import { useQuery } from "@tanstack/react-query";
import type { PermissionCheck } from "@silo-storage/auth/permissions";
import { roleHasPermissions } from "@silo-storage/auth/permissions";

import { useOrganization } from "@/hooks/use-organization";
import { useTRPC } from "@/trpc/react";

export function useOrganizationPermission(permissions: PermissionCheck) {
  const trpc = useTRPC();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? "";

  const roleQuery = useQuery(
    trpc.organization.getMyRole.queryOptions(
      { organizationId },
      { enabled: !!organizationId },
    ),
  );

  const hasPermission =
    !!roleQuery.data &&
    roleHasPermissions(roleQuery.data.role, permissions);

  return {
    organizationId,
    isLoading: !organizationId || roleQuery.isLoading,
    hasPermission,
  };
}
