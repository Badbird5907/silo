"use client";

import type { NavItem } from "@/components/nav-main";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Files,
  FolderKanban,
  LayoutDashboard,
  Settings,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@silo-storage/ui/components/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silo-storage/ui/components/select";
import { Button } from "@silo-storage/ui/components/button";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { authClient } from "@/auth/client";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { useOrganization } from "@/hooks/use-organization";
import { useTRPC } from "@/trpc/react";

function getMainNavItems(
  orgSlug: string,
  projectItems: { title: string; url: string }[],
): NavItem[] {
  return [
    {
      title: "Projects",
      url: `/${orgSlug}`,
      icon: FolderKanban,
      items: projectItems,
    },
    {
      title: "Settings",
      url: `/${orgSlug}/settings`,
      icon: Settings,
    },
  ];
}

function ProjectSwitcherSkeleton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div
          className="flex h-12 w-full items-center gap-2 rounded-md p-2"
          aria-hidden
        >
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-28 max-w-full" />
          </div>
          <Skeleton className="size-4 shrink-0 rounded opacity-70" />
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Matches SelectTrigger (h-9); “Create dev env” only renders after env list has loaded. */
function EnvironmentSwitcherSkeleton() {
  return <Skeleton className="h-9 w-full" />;
}

function getProjectNavItems(projectBasePath: string): NavItem[] {
  return [
    {
      title: "Dashboard",
      url: projectBasePath,
      icon: LayoutDashboard,
    },
    {
      title: "Files",
      url: `${projectBasePath}/files`,
      icon: Files,
    },
    {
      title: "Analytics",
      url: `${projectBasePath}/analytics`,
      icon: BarChart3,
    },
    {
      title: "Settings",
      url: `${projectBasePath}/settings`,
      icon: Settings,
    },
  ];
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [environmentControlsMounted, setEnvironmentControlsMounted] =
    React.useState(false);
  React.useEffect(() => {
    setEnvironmentControlsMounted(true);
  }, []);

  const { state: sidebarState } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const trpc = useTRPC();

  const { data: session } = authClient.useSession();
  const { orgSlug, organization } = useOrganization();
  const organizationId = organization?.id ?? "";

  const projectMatch = /^\/[^/]+\/p\/([^/]+)(?:\/e\/([^/]+))?/.exec(pathname);
  const currentProjectId = projectMatch?.[1];
  const currentEnvironmentSlug = projectMatch?.[2];
  const isInProject = !!currentProjectId;
  const projectBasePath = currentProjectId
    ? currentEnvironmentSlug
      ? `/${orgSlug}/p/${currentProjectId}/e/${currentEnvironmentSlug}`
      : `/${orgSlug}/p/${currentProjectId}`
    : "";

  const environmentsQuery = useQuery(
    trpc.environment.list.queryOptions(
      { organizationId, projectId: currentProjectId ?? "" },
      { enabled: !!organizationId && !!currentProjectId },
    ),
  );

  const currentProjectQuery = useQuery(
    trpc.project.getById.queryOptions(
      { id: currentProjectId ?? "", organizationId },
      { enabled: !!organizationId && !!currentProjectId },
    ),
  );

  const projectsQuery = useQuery(
    trpc.project.list.queryOptions(
      { organizationId },
      { enabled: !!organizationId && !isInProject },
    ),
  );

  const mainProjectItems = React.useMemo(
    () =>
      (projectsQuery.data ?? []).map((project) => ({
        title: project.name,
        url: `/${orgSlug}/p/${project.id}`,
      })),
    [orgSlug, projectsQuery.data],
  );

  const navItems = React.useMemo(
    () =>
      isInProject
        ? getProjectNavItems(projectBasePath)
        : getMainNavItems(orgSlug ?? "", mainProjectItems),
    [isInProject, orgSlug, projectBasePath, mainProjectItems],
  );

  const navLabel = isInProject ? "Project" : "Navigation";
  const isSidebarCollapsed = sidebarState === "collapsed";

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
      },
    });
  };

  const user = session?.user
    ? {
      name: session.user.name,
      email: session.user.email,
      avatar: session.user.image ?? undefined,
    }
    : null;

  const handleEnvironmentChange = (environmentSlug: string) => {
    if (!currentProjectId || !orgSlug) return;
    const nextBase =
      environmentSlug === "__none__"
        ? `/${orgSlug}/p/${currentProjectId}`
        : `/${orgSlug}/p/${currentProjectId}/e/${environmentSlug}`;
    const nextSuffix = pathname.replace(/^\/[^/]+\/p\/[^/]+(?:\/e\/[^/]+)?/, "");
    router.push(`${nextBase}${nextSuffix}`);
  };

  const handleCreateMyDevEnvironment = () => {
    if (!currentProjectId || !orgSlug) return;
    router.push(`/${orgSlug}/p/${currentProjectId}/settings?createDevEnv=1`);
  };

  const hasOwnDevEnv = React.useMemo(() => {
    return (
      !environmentsQuery.isLoading &&
      !!session &&
      environmentsQuery.data?.some(
        (environment) => environment.ownerUserId === session.user.id,
      )
    );
  }, [environmentsQuery.data, environmentsQuery.isLoading, session]);

  const showProjectSwitcherSkeleton =
    isInProject &&
    !!currentProjectId &&
    !!orgSlug &&
    (!organization?.id ||
      (currentProjectQuery.isPending && !currentProjectQuery.isError));

  const showEnvironmentSwitcherSkeleton =
    !environmentControlsMounted || environmentsQuery.isLoading;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        {isInProject ? (
          showProjectSwitcherSkeleton ? (
            <ProjectSwitcherSkeleton />
          ) : (
            <ProjectSwitcher />
          )
        ) : (
          <OrganizationSwitcher />
        )}
        {isInProject && !isSidebarCollapsed && (
          <div className="px-2 pt-2 space-y-2">
            {showEnvironmentSwitcherSkeleton ? (
              <EnvironmentSwitcherSkeleton />
            ) : (
              <>
                <Select
                  value={currentEnvironmentSlug ?? "__none__"}
                  onValueChange={handleEnvironmentChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">All environments</SelectItem>
                    {(environmentsQuery.data ?? []).map((environment) => (
                      <SelectItem key={environment.id} value={environment.slug}>
                        {environment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!hasOwnDevEnv && (
                  <Button
                    variant="outline"
                    className="w-full"
                    size="sm"
                    onClick={handleCreateMyDevEnvironment}
                    aria-label="Create my dev environment"
                  >
                    Create my dev environment
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} label={navLabel} />
      </SidebarContent>
      <SidebarFooter>
        {user && <NavUser user={user} onLogout={handleLogout} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
