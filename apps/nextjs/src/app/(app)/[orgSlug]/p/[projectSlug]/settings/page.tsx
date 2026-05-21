"use client";

import { use } from "react";
import {
  notFound,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@silo-storage/ui/components/skeleton";

import {
  ApiKeysList,
  CreatePersonalEnvironmentWizard,
  EnvironmentsList,
  ProjectGeneralSettings,
} from "@/components/project-settings";
import { DangerZone } from "@/components/project-settings/danger-zone";
import { useOrganization } from "@/hooks/use-organization";
import { useTRPC } from "@/trpc/react";

interface ProjectSettingsPageProps {
  params: Promise<{
    orgSlug: string;
    projectSlug: string;
  }>;
}

export default function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? "";
  const { orgSlug, projectSlug } = use(params);
  const shouldAutoOpenWizard = searchParams.get("createDevEnv") === "1";

  const projectQuery = useQuery(
    trpc.project.getBySlug.queryOptions(
      { slug: projectSlug, organizationId },
      { enabled: !!organizationId && !!projectSlug },
    ),
  );
  const projectId = projectQuery.data?.id ?? "";

  if (projectQuery.isLoading || !organizationId) {
    return (
      <>
        <div className="flex flex-1 flex-col gap-6 p-4">
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    notFound();
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 p-4">
        <ProjectGeneralSettings
          project={projectQuery.data}
          organizationId={organizationId}
        />
        <EnvironmentsList
          projectId={projectId}
          organizationId={organizationId}
        />
        <ApiKeysList projectId={projectId} organizationId={organizationId} />
        <CreatePersonalEnvironmentWizard
          projectId={projectId}
          organizationId={organizationId}
          autoOpen={shouldAutoOpenWizard}
          onCreated={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("createDevEnv");
            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname);
          }}
          onOpenChange={(open) => {
            if (open || !shouldAutoOpenWizard) return;
            const params = new URLSearchParams(searchParams.toString());
            params.delete("createDevEnv");
            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname);
          }}
        />
        <DangerZone
          projectId={projectId}
          organizationId={organizationId}
          orgSlug={orgSlug}
        />
      </div>
    </>
  );
}
