"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Check,
  ChevronsUpDown,
  FolderKanban,
  Plus,
  Settings,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@silo-storage/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@silo-storage/ui/components/sidebar";

import { CreateOrgDialog } from "@/components/create-org-dialog";
import { OrganizationMenuItems } from "@/components/organization-menu-items";
import { useOrganizationSwitcher } from "@/hooks/use-organization-switcher";
import { useTRPC } from "@/trpc/react";

/**
 * Project switcher for project-specific pages.
 * Shows current project with ability to switch projects,
 * and includes organization switching as a submenu.
 */
export function ProjectSwitcher() {
  const [createOrgOpen, setCreateOrgOpen] = React.useState(false);
  const { isMobile } = useSidebar();
  const router = useRouter();
  const params = useParams<{ orgSlug?: string; projectSlug?: string }>();
  const projectSlug = params.projectSlug;
  const trpc = useTRPC();

  const {
    organizations,
    activeOrganization,
    orgSlug,
    handleOrgChange,
    handleCreateOrg,
  } = useOrganizationSwitcher();

  const organizationId = activeOrganization?.id ?? "";

  const projectsQuery = useQuery(
    trpc.project.list.queryOptions(
      { organizationId },
      { enabled: !!organizationId },
    ),
  );

  const currentProjectQuery = useQuery(
    trpc.project.getBySlug.queryOptions(
      { slug: projectSlug ?? "", organizationId },
      { enabled: !!projectSlug && !!organizationId },
    ),
  );

  const projects = projectsQuery.data ?? [];
  const currentProject = currentProjectQuery.data ?? null;

  if (!projectSlug || !currentProject) {
    return null;
  }

  const handleProjectChange = (project: { slug: string }) => {
    router.push(`/${orgSlug}/p/${project.slug}`);
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <FolderKanban className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {currentProject.name}
                  </span>
                  <span className="truncate text-xs">
                    {currentProject.slug}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Projects
              </DropdownMenuLabel>
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleProjectChange(project)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <FolderKanban className="size-3.5 shrink-0" />
                  </div>
                  <span className="flex-1 truncate">{project.name}</span>
                  {project.slug === projectSlug && (
                    <Check className="text-primary size-4" />
                  )}
                </DropdownMenuItem>
              ))}
              {projects.length === 0 && (
                <DropdownMenuItem disabled className="gap-2 p-2">
                  <span className="text-muted-foreground">No projects</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="gap-2 p-2">
                <Link href={`/${orgSlug}/p/${projectSlug}/settings`}>
                  <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                    <Settings className="size-3.5" />
                  </div>
                  <span className="text-muted-foreground font-medium">
                    Project settings
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="gap-2 p-2">
                <Link href={`/${orgSlug}`}>
                  <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                    <Plus className="size-4" />
                  </div>
                  <span className="text-muted-foreground font-medium">
                    All projects
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isMobile ? (
                // On mobile, show organization items inline to avoid submenu overflow
                <OrganizationMenuItems
                  organizations={organizations}
                  activeOrganization={activeOrganization}
                  onOrganizationChange={handleOrgChange}
                  onCreateOrganization={() => setCreateOrgOpen(true)}
                />
              ) : (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2 p-2">
                    <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                      <Building2 className="size-3.5" />
                    </div>
                    <span className="text-muted-foreground font-medium">
                      Switch organization
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-56">
                    <OrganizationMenuItems
                      organizations={organizations}
                      activeOrganization={activeOrganization}
                      onOrganizationChange={handleOrgChange}
                      onCreateOrganization={() => setCreateOrgOpen(true)}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <CreateOrgDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
        onSubmit={handleCreateOrg}
      />
    </>
  );
}
