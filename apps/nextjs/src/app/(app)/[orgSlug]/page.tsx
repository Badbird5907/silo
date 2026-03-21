import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { ProjectsPageClient } from "./client";
import {
  getOrganizationBySlugQueryOptions,
} from "@/lib/organization";
import { getQueryClient, trpc } from "@/trpc/server";

export default async function ProjectsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();
  const organization = await queryClient.ensureQueryData(
    getOrganizationBySlugQueryOptions(
      trpc.organization.getBySlug.queryOptions,
      orgSlug,
    ),
  );

  void queryClient.prefetchQuery(
    trpc.project.list.queryOptions(
      { organizationId: organization.id },
      { enabled: true },
    )
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectsPageClient />
    </HydrationBoundary>
  );
} 