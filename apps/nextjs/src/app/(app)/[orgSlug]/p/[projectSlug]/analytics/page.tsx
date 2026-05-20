"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  DownloadIcon,
  FileIcon,
  HardDriveIcon,
  UploadIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@silo-storage/ui/components/chart";
import { DateRangePicker } from "@silo-storage/ui/components/date-range-picker";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { useOrganization } from "@/hooks/use-organization";
import { formatDateParam } from "@/lib/format";
import { useTRPC } from "@/trpc/react";
import { StatCard } from "./stat-card";

interface AnalyticsPageProps {
  params: Promise<{
    orgSlug: string;
    projectSlug: string;
    environment?: string;
  }>;
}

const DEFAULT_ANALYTICS_DAYS = 14;

interface AnalyticsDateRange {
  from: Date;
  to: Date;
}

interface PickerDateRange {
  from?: Date;
  to?: Date;
}

interface DailyChartDatum {
  date: string;
  uploadsCompleted: number;
  uploadsFailed: number;
  downloads: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  storageBytes: number | null;
}

function getDefaultAnalyticsRange() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(end.getDate() - (DEFAULT_ANALYTICS_DAYS - 1));

  return { from: start, to: end };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatChartDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function AnalyticsStatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="mb-2 h-8 w-24" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

function AnalyticsChartCardSkeleton({
  chartClassName,
}: {
  chartClassName: string;
}) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="mb-2 h-5 w-44 max-w-full" />
        <Skeleton className="h-3 w-full max-w-md" />
      </CardHeader>
      <CardContent>
        <Skeleton className={`w-full rounded-md ${chartClassName}`} />
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage({ params }: AnalyticsPageProps) {
  const trpc = useTRPC();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? "";
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(() =>
    getDefaultAnalyticsRange(),
  );

  const { projectSlug, environment: environmentSlug } = use(params);

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

  const analyticsQuery = useQuery(
    trpc.analytics.getProjectStats.queryOptions(
      {
        projectId,
        organizationId,
        environmentId: selectedEnvironmentId,
        startDate: formatDateParam(dateRange.from),
        endDate: formatDateParam(dateRange.to),
      },
      { enabled: !!organizationId && !!projectId },
    ),
  );

  if (projectQuery.isLoading || !organizationId) {
    return (
      <div
        className="flex flex-1 flex-col gap-4 p-4"
        aria-busy="true"
        aria-label="Loading analytics"
      >
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-8 w-40 shrink-0" />
          <div className="flex w-full justify-end sm:ml-auto sm:w-auto">
            <Skeleton className="h-10 w-full rounded-md sm:w-[320px]" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <AnalyticsStatCardSkeleton key={i} />
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <AnalyticsChartCardSkeleton chartClassName="h-[200px]" />
          <AnalyticsChartCardSkeleton chartClassName="h-[200px]" />
        </div>

        <AnalyticsChartCardSkeleton chartClassName="h-[240px]" />

        <AnalyticsChartCardSkeleton chartClassName="h-[400px]" />
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

  const uploadActivityChartConfig = {
    uploadsCompleted: { label: "Completed", color: "var(--chart-1)" },
    uploadsFailed: { label: "Failed", color: "var(--chart-2)" },
  };

  const secondaryAnalyticsChartConfig = {
    downloads: {
      label: "Downloads",
      theme: {
        light: "oklch(0.52 0.2 264)",
        dark: "oklch(0.7 0.14 264)",
      },
    },
    storageBytes: {
      label: "Stored",
      theme: {
        light: "oklch(0.48 0.11 55)",
        dark: "oklch(0.74 0.11 72)",
      },
    },
    bytesUploaded: {
      label: "Uploaded",
      theme: {
        light: "oklch(0.5 0.14 215)",
        dark: "oklch(0.72 0.11 215)",
      },
    },
    bytesDownloaded: {
      label: "Downloaded",
      theme: {
        light: "oklch(0.5 0.17 305)",
        dark: "oklch(0.68 0.13 305)",
      },
    },
  };

  const dailyData: DailyChartDatum[] =
    stats?.daily.map((d) => ({
      date: d.date,
      uploadsCompleted: d.uploadsCompleted,
      uploadsFailed: d.uploadsFailed,
      downloads: d.downloads,
      bytesUploaded: d.bytesUploaded,
      bytesDownloaded: d.bytesDownloaded,
      storageBytes: d.storageBytes,
    })) ?? [];
  const hasStorageHistory = dailyData.some((d) => d.storageBytes !== null);

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex w-full">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <div className="ml-auto flex justify-end">
            <DateRangePicker
              className="w-[320px]"
              value={dateRange}
              defaultMonth={dateRange.from}
              onChange={(range: PickerDateRange | undefined) => {
                if (!range?.from) {
                  return;
                }
                setDateRange({
                  from: range.from,
                  to: range.to ?? range.from,
                });
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Storage"
            value={formatBytes(stats?.storage.totalBytes ?? 0)}
            description="Current stored bytes"
            icon={HardDriveIcon}
          />
          <StatCard
            title="Uploads"
            value={stats?.totals.uploadsCompleted ?? 0}
            description={`${stats?.totals.uploadsFailed ?? 0} failed`}
            icon={UploadIcon}
          />
          <StatCard
            title="Downloads"
            value={stats?.totals.downloads ?? 0}
            description="Total downloads"
            icon={DownloadIcon}
          />
          <StatCard
            title="Data Transferred"
            value={formatBytes(
              (stats?.totals.bytesUploaded ?? 0) +
                (stats?.totals.bytesDownloaded ?? 0),
            )}
            description="Upload + Download"
            icon={FileIcon}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upload Activity</CardTitle>
              <CardDescription>
                Completed and failed uploads in the selected range
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsQuery.isLoading ? (
                <Skeleton className="h-[200px] w-full rounded-md" />
              ) : dailyData.length > 0 ? (
                <ChartContainer
                  config={uploadActivityChartConfig}
                  className="aspect-auto h-[200px]"
                >
                  <BarChart data={dailyData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      className="fill-muted-foreground text-xs"
                      tickFormatter={(value) =>
                        formatChartDate(value as string)
                      }
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      className="fill-muted-foreground text-xs"
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <Bar
                      dataKey="uploadsCompleted"
                      fill="oklch(69.6% 0.17 162.48)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="uploadsFailed"
                      fill="oklch(64.5% 0.246 16.439)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[200px] items-center justify-center">
                  <p className="text-muted-foreground">No data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Download Activity</CardTitle>
              <CardDescription>
                File downloads in the selected range
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsQuery.isLoading ? (
                <Skeleton className="h-[200px] w-full rounded-md" />
              ) : dailyData.length > 0 ? (
                <ChartContainer
                  config={secondaryAnalyticsChartConfig}
                  className="aspect-auto h-[200px]"
                >
                  <AreaChart data={dailyData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      className="fill-muted-foreground text-xs"
                      tickFormatter={(value) =>
                        formatChartDate(value as string)
                      }
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      className="fill-muted-foreground text-xs"
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="downloads"
                      stroke="var(--color-downloads)"
                      fill="var(--color-downloads)"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[200px] items-center justify-center">
                  <p className="text-muted-foreground">No data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <CardDescription>Total storage over time</CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsQuery.isLoading ? (
              <Skeleton className="h-[240px] w-full rounded-md" />
            ) : hasStorageHistory ? (
              <ChartContainer
                config={secondaryAnalyticsChartConfig}
                className="aspect-auto h-[240px]"
              >
                <AreaChart data={dailyData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="fill-muted-foreground text-xs"
                    tickFormatter={(value) => formatChartDate(value as string)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="fill-muted-foreground text-xs"
                    tickFormatter={(value) =>
                      typeof value === "number" ? formatBytes(value) : ""
                    }
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) =>
                          typeof label === "string"
                            ? formatChartDate(label)
                            : String(label)
                        }
                        formatter={(value, name) => (
                          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <span className="text-muted-foreground">
                              {name}
                            </span>
                            <span className="text-foreground font-mono font-medium tabular-nums">
                              {typeof value === "number"
                                ? formatBytes(value)
                                : "Unknown"}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="storageBytes"
                    stroke="var(--color-storageBytes)"
                    fill="var(--color-storageBytes)"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center">
                <p className="text-muted-foreground">
                  Storage history starts on the day snapshot tracking was
                  enabled.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bandwidth Usage</CardTitle>
            <CardDescription>
              Data uploaded and downloaded in the selected range
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsQuery.isLoading ? (
              <Skeleton className="h-[400px] w-full rounded-md" />
            ) : dailyData.length > 0 ? (
              <ChartContainer
                config={secondaryAnalyticsChartConfig}
                className="aspect-auto h-[400px]"
              >
                <AreaChart data={dailyData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="fill-muted-foreground text-xs"
                    tickFormatter={(value) => formatChartDate(value as string)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="fill-muted-foreground text-xs"
                    tickFormatter={(value) => formatBytes(value as number)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="bytesUploaded"
                    stroke="var(--color-bytesUploaded)"
                    fill="var(--color-bytesUploaded)"
                    fillOpacity={0.3}
                    stackId="1"
                  />
                  <Area
                    type="monotone"
                    dataKey="bytesDownloaded"
                    stroke="var(--color-bytesDownloaded)"
                    fill="var(--color-bytesDownloaded)"
                    fillOpacity={0.3}
                    stackId="1"
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-muted-foreground">No data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
