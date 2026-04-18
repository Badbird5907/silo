"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@silo-storage/ui/components/chart";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { useTRPC } from "@/trpc/react";
import { getFilesDashboardDateRange } from "./chart-timeframe";

interface StoredFilesChartProps {
  projectId: string;
  organizationId: string;
  environmentId?: string;
}

interface StoredFilesDatum {
  date: string;
  storedFiles: number;
}

function getStoredFilesValue(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "storedFiles" in value &&
    typeof value.storedFiles === "number"
  ) {
    return value.storedFiles;
  }

  return 0;
}

function formatChartDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function StoredFilesChart({
  projectId,
  organizationId,
  environmentId,
}: StoredFilesChartProps) {
  const areaGradientId = `stored-files-fill-${useId().replace(/:/g, "")}`;
  const { startDate, endDate } = getFilesDashboardDateRange();
  const trpc = useTRPC();

  const analyticsQuery = useQuery(
    trpc.analytics.getProjectStats.queryOptions(
      {
        projectId,
        organizationId,
        environmentId,
        startDate,
        endDate,
      },
      { enabled: !!organizationId && !!projectId },
    ),
  );

  const dailyData: StoredFilesDatum[] =
    analyticsQuery.data?.daily.map((d) => ({
      date: d.date,
      storedFiles: getStoredFilesValue(d),
    })) ?? [];
  const startDateLabel = dailyData[0]?.date;
  const endDateLabel = dailyData[dailyData.length - 1]?.date;
  const tickDates =
    startDateLabel && endDateLabel
      ? startDateLabel === endDateLabel
        ? [startDateLabel]
        : [startDateLabel, endDateLabel]
      : [];

  const hasStoredFiles = dailyData.some((d) => d.storedFiles > 0);

  if (analyticsQuery.isLoading) {
    return <Skeleton className="h-[110px] w-full" />;
  }

  if (analyticsQuery.isError) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <p className="text-muted-foreground text-center text-sm">
          Unable to load stored files trend.
        </p>
      </div>
    );
  }

  if (!hasStoredFiles) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <p className="text-muted-foreground text-center text-sm">
          No completed uploads in the last 7 days.
        </p>
      </div>
    );
  }

  return (
    <ChartContainer
      config={{ storedFiles: { label: "Stored files", color: "var(--chart-4)" } }}
      className="aspect-auto h-[110px]"
    >
      <AreaChart data={dailyData}>
        <defs>
          <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-storedFiles)" stopOpacity={0.28} />
            <stop
              offset="55%"
              stopColor="var(--color-storedFiles)"
              stopOpacity={0.08}
            />
            <stop offset="100%" stopColor="var(--color-storedFiles)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_value, payload) => {
                const data = payload[0]?.payload as StoredFilesDatum | undefined;
                if (data?.date) {
                  return formatChartDate(data.date);
                }
                return "";
              }}
              formatter={(value, name) => (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {typeof value === "number" ? `${value.toLocaleString()} files` : "-"}
                  </span>
                </div>
              )}
            />
          }
        />
        <XAxis
          dataKey="date"
          ticks={tickDates}
          interval={0}
          padding={{ left: 10, right: 10 }}
          tickFormatter={(value) => formatChartDate(String(value))}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          className="fill-muted-foreground text-[10px]"
        />
        <Area
          type="monotone"
          name="Stored files"
          dataKey="storedFiles"
          stroke="var(--color-storedFiles)"
          fill={`url(#${areaGradientId})`}
        />
      </AreaChart>
    </ChartContainer>
  );
}
