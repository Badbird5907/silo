"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  HardDriveIcon,
  ScrollText,
  SettingsIcon,
  TrendingUpIcon,
  Upload,
  UploadIcon,
} from "lucide-react";

import { Badge } from "@silo-storage/ui/components/badge";
import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";
import { Separator } from "@silo-storage/ui/components/separator";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { useOrganization } from "@/hooks/use-organization";
import {
  formatBytes,
  formatRelativeTime,
  getAuditEventBgColor,
  getAuditEventColor,
  getAuditEventIcon,
  getAuditEventLabel,
} from "@/lib/audit";
import { useTRPC } from "@/trpc/react";

interface ProjectPageProps {
  params: Promise<{
    orgSlug: string;
    projectSlug: string;
    environment?: string;
  }>;
}

function StatCardSkeleton() {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-1 h-8 w-20" />
        <Skeleton className="h-3 w-16" />
      </CardContent>
    </Card>
  );
}

function QuickActionsSkeleton() {
  return (
    <Card className="gap-2">
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="grid gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EnvironmentsCardSkeleton() {
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-8 w-8 rounded-md" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivityCardSkeleton() {
  return (
    <Card className="gap-2 lg:col-span-3">
      <CardHeader className="mb-2 flex flex-row items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-6 py-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-full max-w-[min(100%,240px)]" />
                <Skeleton className="h-3 w-2/3 max-w-[min(100%,180px)]" />
              </div>
              <Skeleton className="h-3 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const trpc = useTRPC();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? "";

  const { projectSlug, orgSlug, environment: environmentSlug } = use(params);

  const projectQuery = useQuery(
    trpc.project.getBySlug.queryOptions(
      { slug: projectSlug, organizationId },
      { enabled: !!organizationId && !!projectSlug },
    ),
  );
  const projectId = projectQuery.data?.id ?? "";
  const environmentsQuery = useQuery(
    trpc.environment.list.queryOptions(
      { projectId, organizationId },
      { enabled: !!organizationId && !!projectId },
    ),
  );

  const selectedEnvironment = (environmentsQuery.data ?? []).find(
    (env) => env.slug === environmentSlug,
  );
  const selectedEnvironmentId = selectedEnvironment?.id;
  const analyticsInput: Parameters<
    typeof trpc.analytics.getProjectStats.queryOptions
  >[0] & {
    includeFileCount: true;
  } = {
    projectId,
    organizationId,
    environmentId: selectedEnvironmentId,
    includeFileCount: true,
  };

  const analyticsQuery = useQuery(
    trpc.analytics.getProjectStats.queryOptions(
      analyticsInput,
      { enabled: !!organizationId && !!projectId },
    ),
  );

  const recentEventsQuery = useQuery(
    trpc.audit.recent.queryOptions(
      {
        projectId,
        organizationId,
        environmentId: selectedEnvironmentId,
        limit: 10,
      },
      { enabled: !!organizationId && !!projectId },
    ),
  );

  if (projectQuery.isLoading || !organizationId) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <QuickActionsSkeleton />
            <EnvironmentsCardSkeleton />
          </div>
          <RecentActivityCardSkeleton />
        </div>
      </div>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    notFound();
  }
  if (environmentSlug && !environmentsQuery.isLoading && !selectedEnvironment) {
    notFound();
  }
  if (!analyticsQuery.data) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <QuickActionsSkeleton />
            <EnvironmentsCardSkeleton />
          </div>
          <RecentActivityCardSkeleton />
        </div>
      </div>
    );
  }

  const stats = analyticsQuery.data;
  const environments = environmentsQuery.data ?? [];
  const recentEvents = recentEventsQuery.data ?? [];
  const projectBasePath = selectedEnvironment
    ? `/${orgSlug}/p/${projectSlug}/e/${selectedEnvironment.slug}`
    : `/${orgSlug}/p/${projectSlug}`;

  const totalBytes = stats.storage.totalBytes;
  const uploadBytes = stats.totals.bytesUploaded;
  const downloadBytes = stats.totals.bytesDownloaded;
  const totalTransferred = uploadBytes + downloadBytes;
  const uploadPercent =
    totalTransferred > 0 ? (uploadBytes / totalTransferred) * 100 : 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm font-medium">
                Total Storage
              </p>
              <div className="bg-primary/10 text-primary rounded-lg p-2">
                <HardDriveIcon className="h-4 w-4" />
              </div>
            </div>
            <>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {formatBytes(totalBytes)}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {stats.storage.fileCount} files stored
              </p>
            </>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm font-medium">
                Uploads
              </p>
              <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
                <UploadIcon className="h-4 w-4" />
              </div>
            </div>
            <>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {stats.totals.uploadsCompleted}
              </p>
              <div className="mt-1 flex items-center gap-2 text-sm">
                {stats.totals.uploadsFailed > 0 ? (
                  <span className="text-red-400">
                    {stats.totals.uploadsFailed} failed
                  </span>
                ) : (
                  <span className="text-green-500">All successful</span>
                )}
                <span className="text-muted-foreground">/ 30 days</span>
              </div>
            </>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm font-medium">
                Downloads
              </p>
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                <DownloadIcon className="h-4 w-4" />
              </div>
            </div>
            <>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {stats.totals.downloads}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Last 30 days
              </p>
            </>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm font-medium">
                Bandwidth
              </p>
              <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
                <TrendingUpIcon className="h-4 w-4" />
              </div>
            </div>
            <>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {formatBytes(totalTransferred)}
              </p>
              {totalTransferred > 0 && (
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-green-500">
                      {formatBytes(uploadBytes)} up
                    </span>
                    <span className="text-blue-500">
                      {formatBytes(downloadBytes)} down
                    </span>
                  </div>
                  <div className="bg-blue-500 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${Math.max(uploadPercent, 5)}%` }}
                    />
                    {/* <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(100 - uploadPercent, 5)}%` }} /> */}
                  </div>
                </div>
              )}
              {totalTransferred === 0 && (
                <p className="text-muted-foreground mt-1 text-sm">
                  Last 30 days
                </p>
              )}
            </>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="gap-2">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Link
                href={`${projectBasePath}/files`}
                className="hover:bg-muted/80 group flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm"
              >
                <div className="bg-primary/10 text-primary rounded-lg p-2.5">
                  <FileIcon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Browse Files</p>
                  <p className="text-muted-foreground text-xs">
                    View and manage uploaded files
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>

              <Link
                href={`${projectBasePath}/analytics`}
                className="hover:bg-muted/80 group flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm"
              >
                <div className="rounded-lg bg-purple-500/10 p-2.5 text-purple-500">
                  <TrendingUpIcon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">View Analytics</p>
                  <p className="text-muted-foreground text-xs">
                    Detailed usage statistics
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>

              <Link
                href={`${projectBasePath}/audit`}
                className="hover:bg-muted/80 group flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm"
              >
                <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-500">
                  <ScrollText className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Audit Log</p>
                  <p className="text-muted-foreground text-xs">
                    Full history of project events
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>

              <Link
                href={`${projectBasePath}/settings`}
                className="hover:bg-muted/80 group flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm"
              >
                <div className="rounded-lg bg-orange-500/10 p-2.5 text-orange-500">
                  <SettingsIcon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Project Settings</p>
                  <p className="text-muted-foreground text-xs">
                    Configure environments and keys
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </CardContent>
          </Card>

          {/* Environments */}
          <Card className="gap-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Environments</CardTitle>
                <CardDescription className="text-xs">
                  {environments.length} configured
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link href={`${projectBasePath}/settings`}>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {environmentsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : environments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="bg-muted mb-3 rounded-full p-3">
                    <FolderIcon className="text-muted-foreground h-5 w-5" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    No environments yet
                  </p>
                  <Button variant="link" size="sm" asChild className="mt-1">
                    <Link href={`${projectBasePath}/settings`}>
                      Create your first environment
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {environments.map((env) => (
                    <div
                      key={env.id}
                      className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-3 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ring-2 ${
                            env.type === "production"
                              ? "bg-green-500 ring-green-500/20"
                              : env.type === "staging"
                                ? "bg-yellow-500 ring-yellow-500/20"
                                : "bg-blue-500 ring-blue-500/20"
                          }`}
                        />
                        <span className="text-sm font-medium">{env.name}</span>
                      </div>
                      <Badge
                        variant={
                          env.type === "production"
                            ? "default"
                            : env.type === "staging"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-xs"
                      >
                        {env.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity (right column) */}
        <Card className="lg:col-span-3 gap-2">
          <CardHeader className="flex flex-row items-center justify-between mb-2">
            <div>
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <CardDescription className="text-xs">
                Latest operational events
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${projectBasePath}/audit`}>
                View All
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {recentEventsQuery.isLoading ? (
              <div className="space-y-0">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-6 py-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            ) : recentEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-muted mb-4 rounded-full p-4">
                  <Upload className="text-muted-foreground h-6 w-6" />
                </div>
                <p className="font-medium">No activity yet</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Upload some files to see activity here
                </p>
              </div>
            ) : (
              <div className="">
                {recentEvents.slice(0, 8).map((event) => {
                  const Icon = getAuditEventIcon(event.eventCode);
                  const colorClass = getAuditEventColor(event.eventCode);
                  const bgColorClass = getAuditEventBgColor(event.eventCode);
                  const fileName =
                    typeof event.metadata.fileName === "string"
                      ? event.metadata.fileName
                      : null;
                  const fileKeyId =
                    typeof event.metadata.fileKeyId === "string"
                      ? event.metadata.fileKeyId
                      : null;
                  const isClickable = !!fileKeyId;

                  const content = (
                    <div
                      className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                        isClickable ? "hover:bg-muted/50 cursor-pointer" : ""
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bgColorClass} ${colorClass}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {fileName ?? getAuditEventLabel(event.eventCode)}
                        </p>
                        <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                          <span>{getAuditEventLabel(event.eventCode)}</span>
                          {event.environment?.name && (
                            <>
                              <span className="text-muted-foreground/40">
                                /
                              </span>
                              <span>{event.environment.name}</span>
                            </>
                          )}
                          {typeof event.metadata.bytes === "number" && (
                            <>
                              <span className="text-muted-foreground/40">
                                /
                              </span>
                              <span>{formatBytes(event.metadata.bytes)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatRelativeTime(event.createdAt)}
                      </span>
                      {isClickable && (
                        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                      )}
                    </div>
                  );

                  return isClickable ? (
                    <Link
                      key={event.id}
                      href={`${projectBasePath}/files/${fileKeyId}`}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={event.id}>{content}</div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
