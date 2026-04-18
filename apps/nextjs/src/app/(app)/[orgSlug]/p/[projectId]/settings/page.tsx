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

import { DangerZone } from "@/components/project-settings/danger-zone";
import {
  ApiKeysList,
  CreatePersonalEnvironmentWizard,
  EnvironmentsList,
  ProjectGeneralSettings,
} from "@/components/project-settings";
import { useOrganization } from "@/hooks/use-organization";
import { useTRPC } from "@/trpc/react";

interface ProjectSettingsPageProps {
  params: Promise<{
    orgSlug: string;
    projectId: string;
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
  const { orgSlug } = use(params);
  const { projectId } = use(params);
  const shouldAutoOpenWizard = searchParams.get("createDevEnv") === "1";

  const projectQuery = useQuery(
    trpc.project.getById.queryOptions(
      { id: projectId, organizationId },
      { enabled: !!organizationId },
    ),
  );

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
          project={{
            id: projectQuery.data.id,
            name: projectQuery.data.name,
            slug: projectQuery.data.slug,
            defaultFileAccess: projectQuery.data.defaultFileAccess,
            imageDeliveryPolicy: projectQuery.data.imageDeliveryPolicy,
            preserveImageExif: projectQuery.data.preserveImageExif,
            pendingUploadFailAfterMinutes:
              projectQuery.data.pendingUploadFailAfterMinutes,
          }}
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
