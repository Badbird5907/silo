"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, FolderKanban, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";
import { Input } from "@silo-storage/ui/components/input";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { CreateProjectDialog } from "@/components/create-project-dialog";
import { useOrganization } from "@/hooks/use-organization";
import { useTRPC } from "@/trpc/react";

function ProjectsListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading projects">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <Skeleton className="mb-2 h-6 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent className="border-b py-4">
          <Skeleton className="h-10 w-full rounded-md" />
        </CardContent>
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <Skeleton className="h-4 w-36 max-w-[min(100%,12rem)]" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-14 shrink-0 sm:w-16" />
            </div>
          ))}
        </div>
        <CardFooter className="py-4">
          <Skeleton className="h-3 w-52 max-w-full" />
        </CardFooter>
      </Card>
    </div>
  );
}

export function ProjectsPageClient() {
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const trpc = useTRPC();
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const { organization, isLoading: organizationLoading } = useOrganization();
  const organizationId = organization?.id ?? "";

  const projectsQuery = useQuery(
    trpc.project.list.queryOptions(
      { organizationId },
      { enabled: !!organizationId },
    ),
  );

  const createProjectMutation = useMutation(
    trpc.project.create.mutationOptions({
      onSuccess: () => {
        void projectsQuery.refetch();
        toast.success("Project created successfully");
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to create project");
      },
    }),
  );

  const handleCreateProject = async (data: { name: string; slug: string }) => {
    await createProjectMutation.mutateAsync({ ...data, organizationId });
  };

  const projects = projectsQuery.data;
  const totalProjects = projects?.length ?? 0;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProjects = React.useMemo(
    () => {
      if (!projects) return [];
      return projects.filter((project) => {
        if (!normalizedSearch) return true;
        return (
          project.name.toLowerCase().includes(normalizedSearch) ||
          project.slug.toLowerCase().includes(normalizedSearch)
        );
      });
    },
    [projects, normalizedSearch],
  );

  const showProjectsSkeleton =
    organizationLoading ||
    (Boolean(organizationId) &&
      (projectsQuery.isPending || projectsQuery.isLoading));

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage projects for{" "}
              <span className="text-foreground font-medium">
                {organization?.name ?? "your organization"}
              </span>
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 size-4" />
            New project
          </Button>
        </div>

        {showProjectsSkeleton ? (
          <ProjectsListSkeleton />
        ) : totalProjects === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-20">
            <div className="from-primary/10 to-primary/5 flex size-20 items-center justify-center rounded-2xl bg-linear-to-br">
              <FolderKanban className="text-primary size-10" />
            </div>
            <div className="max-w-sm text-center">
              <h3 className="mb-2 text-2xl font-bold">No projects yet</h3>
              <p className="text-muted-foreground mb-6 text-base">
                Create your first project to start managing your S3 storage and
                files.
              </p>
            </div>
            <Button size="lg" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 size-5" />
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-5">
                <CardTitle>Project list</CardTitle>
                <CardDescription>
                  Open a project to view files, analytics, and settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="border-b py-4">
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by project name or slug..."
                  startContent={<Search className="size-4" />}
                />
              </CardContent>

              {filteredProjects.length === 0 ? (
                <CardContent className="py-10 text-center">
                  <p className="text-sm font-medium">No matching projects</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Try a different search term or clear the filter.
                  </p>
                  <Button
                    variant="ghost"
                    className="mt-4"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear search
                  </Button>
                </CardContent>
              ) : (
                <div className="divide-y">
                  {filteredProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/${orgSlug}/p/${project.id}`}
                      className="hover:bg-muted/50 group flex items-center justify-between px-6 py-4 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
                            <FolderKanban className="size-4" />
                          </div>
                          <p className="truncate text-sm font-semibold">
                            {project.name}
                          </p>
                          {/* <Badge variant="outline" className="max-w-full">
                            <span className="truncate">{project.slug}</span>
                          </Badge> */}
                          <p className="text-muted-foreground text-xs">
                            {project.slug}
                          </p>
                        </div>
                      </div>
                      <div className="text-muted-foreground group-hover:text-foreground flex items-center gap-1 text-sm">
                        Open
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <CardFooter className="text-muted-foreground py-4 text-xs">
                {filteredProjects.length} of {totalProjects} project
                {totalProjects === 1 ? "" : "s"} shown
              </CardFooter>
            </Card>
          </div>
        )}
      </div>

      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        organizationId={organizationId}
        onSubmit={handleCreateProject}
        isLoading={createProjectMutation.isPending}
      />
    </>
  );
}
