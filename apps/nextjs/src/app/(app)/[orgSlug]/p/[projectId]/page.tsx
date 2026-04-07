"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  HardDriveIcon,
  SettingsIcon,
  TrendingUpIcon,
  Upload,
  UploadIcon,
  XCircle,
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
import { useTRPC } from "@/trpc/react";

interface ProjectPageProps {
  params: Promise<{
    orgSlug: string;
    projectId: string;
    environment?: string;
  }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case "upload_started":
      return Clock;
    case "upload_completed":
      return CheckCircle2;
    case "upload_failed":
      return XCircle;
    case "download":
      return DownloadIcon;
    default:
      return FileIcon;
  }
}

function getEventColor(eventType: string) {
  switch (eventType) {
    case "upload_started":
      return "text-yellow-500";
    case "upload_completed":
      return "text-green-500";
    case "upload_failed":
      return "text-red-500";
    case "download":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
}

function getEventBgColor(eventType: string) {
  switch (eventType) {
    case "upload_started":
      return "bg-yellow-500/10";
    case "upload_completed":
      return "bg-green-500/10";
    case "upload_failed":
      return "bg-red-500/10";
    case "download":
      return "bg-blue-500/10";
    default:
      return "bg-muted";
  }
}

function getEventLabel(eventType: string) {
  switch (eventType) {
    case "upload_started":
      return "Upload started";
    case "upload_completed":
      return "Upload completed";
    case "upload_failed":
      return "Upload failed";
    case "download":
      return "Downloaded";
    default:
      return eventType;
  }
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

export default function ProjectPage({ params }: ProjectPageProps) {
  const trpc = useTRPC();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? "";

  const { projectId, orgSlug, environment: environmentSlug } = use(params);

  const projectQuery = useQuery(
    trpc.project.getById.queryOptions(
      { id: projectId, organizationId },
      { enabled: !!organizationId },
    ),
  );
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

  const analyticsQuery = useQuery(
    trpc.analytics.getProjectStats.queryOptions(
      { projectId, organizationId, environmentId: selectedEnvironmentId },
      { enabled: !!organizationId && !!projectId },
    ),
  );

  const recentEventsQuery = useQuery(
    trpc.analytics.getRecentEvents.queryOptions(
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
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
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

  const stats = analyticsQuery.data;
  const environments = environmentsQuery.data ?? [];
  const recentEvents = recentEventsQuery.data ?? [];
  const projectBasePath = selectedEnvironment
    ? `/${orgSlug}/p/${projectId}/e/${selectedEnvironment.slug}`
    : `/${orgSlug}/p/${projectId}`;

  const totalBytes = stats?.storage.totalBytes ?? 0;
  const uploadBytes = stats?.totals.bytesUploaded ?? 0;
  const downloadBytes = stats?.totals.bytesDownloaded ?? 0;
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
            {analyticsQuery.isLoading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <>
                <p className="mt-3 text-3xl font-bold tracking-tight">
                  {formatBytes(totalBytes)}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {stats?.storage.fileCount ?? 0} files stored
                </p>
              </>
            )}
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
            {analyticsQuery.isLoading ? (
              <Skeleton className="mt-3 h-8 w-16" />
            ) : (
              <>
                <p className="mt-3 text-3xl font-bold tracking-tight">
                  {stats?.totals.uploadsCompleted ?? 0}
                </p>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  {(stats?.totals.uploadsFailed ?? 0) > 0 ? (
                    <span className="text-red-400">
                      {stats?.totals.uploadsFailed} failed
                    </span>
                  ) : (
                    <span className="text-green-500">All successful</span>
                  )}
                  <span className="text-muted-foreground">/ 30 days</span>
                </div>
              </>
            )}
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
            {analyticsQuery.isLoading ? (
              <Skeleton className="mt-3 h-8 w-16" />
            ) : (
              <>
                <p className="mt-3 text-3xl font-bold tracking-tight">
                  {stats?.totals.downloads ?? 0}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Last 30 days
                </p>
              </>
            )}
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
            {analyticsQuery.isLoading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
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
                      <div className="h-full bg-green-500" style={{ width: `${Math.max(uploadPercent, 5)}%` }} />
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
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
          <Card>
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
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <CardDescription className="text-xs">
                Latest uploads and downloads
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${projectBasePath}/analytics`}>
                View All
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {recentEventsQuery.isLoading ? (
              <div className="space-y-0 divide-y">
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
              <div className="divide-y">
                {recentEvents.slice(0, 8).map((event) => {
                  const Icon = getEventIcon(event.eventType);
                  const colorClass = getEventColor(event.eventType);
                  const bgColorClass = getEventBgColor(event.eventType);
                  const fileKey = event.file?.fileKeys[0];
                  const fileName = fileKey?.fileName;
                  const fileKeyId = fileKey?.id;
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
                          {fileName ?? getEventLabel(event.eventType)}
                        </p>
                        <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                          <span>{getEventLabel(event.eventType)}</span>
                          {event.environment.name && (
                            <>
                              <span className="text-muted-foreground/40">
                                /
                              </span>
                              <span>{event.environment.name}</span>
                            </>
                          )}
                          {event.bytes != null && (
                            <>
                              <span className="text-muted-foreground/40">
                                /
                              </span>
                              <span>{formatBytes(event.bytes)}</span>
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
