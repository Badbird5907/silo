"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

/**
 * Hook to get the current organization based on the URL slug.
 * This replaces better-auth's useActiveOrganization by resolving
 * the organization from the [orgSlug] URL parameter.
 */
export function useOrganization() {
  const params = useParams<{ orgSlug?: string }>();
  const orgSlug = params.orgSlug;
  const trpc = useTRPC();

  const query = useQuery(
    trpc.organization.getBySlug.queryOptions(
      { slug: orgSlug ?? "" },
      { enabled: !!orgSlug },
    ),
  );

  return {
    organization: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    orgSlug,
  };
}
