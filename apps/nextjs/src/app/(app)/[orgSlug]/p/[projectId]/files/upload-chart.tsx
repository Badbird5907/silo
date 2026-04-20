"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@silo-storage/ui/components/chart";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { useTRPC } from "@/trpc/react";
import { getFilesDashboardDateRange } from "./chart-timeframe";

interface UploadActivityChartProps {
  projectId: string;
  organizationId: string;
  environmentId?: string;
}

interface UploadChartDatum {
  date: string;
  uploadsCompleted: number;
  uploadsFailed: number;
}

function formatChartDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function UploadActivityChart({
  projectId,
  organizationId,
  environmentId,
}: UploadActivityChartProps) {
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

  const chartConfig = {
    uploadsCompleted: { label: "Completed", color: "var(--chart-1)" },
    uploadsFailed: { label: "Failed", color: "var(--chart-2)" },
  };

  const dailyData: UploadChartDatum[] =
    analyticsQuery.data?.daily.map((d) => ({
      date: d.date,
      uploadsCompleted: d.uploadsCompleted,
      uploadsFailed: d.uploadsFailed,
    })) ?? [];
  const startDateLabel = dailyData[0]?.date;
  const endDateLabel = dailyData[dailyData.length - 1]?.date;
  const tickDates =
    startDateLabel && endDateLabel
      ? startDateLabel === endDateLabel
        ? [startDateLabel]
        : [startDateLabel, endDateLabel]
      : [];

  const hasActivity = dailyData.some(
    (d) => d.uploadsCompleted > 0 || d.uploadsFailed > 0,
  );

  if (analyticsQuery.isLoading) {
    return <Skeleton className="h-[110px] w-full" />;
  }

  if (analyticsQuery.isError) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <p className="text-muted-foreground text-center text-sm">
          Unable to load upload activity.
        </p>
      </div>
    );
  }

  if (!hasActivity) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <p className="text-muted-foreground text-center text-sm">
          No upload activity in the last 7 days.
        </p>
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[110px]">
      <BarChart data={dailyData}>
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_value, payload) => {
                const data = payload[0]?.payload as
                  | UploadChartDatum
                  | undefined;
                if (data?.date) {
                  return formatChartDate(data.date);
                }
                return "";
              }}
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
        <Bar
          dataKey="uploadsCompleted"
          fill="oklch(69.6% 0.17 162.48)"
          radius={[2, 2, 0, 0]}
        />
        <Bar
          dataKey="uploadsFailed"
          fill="oklch(64.5% 0.246 16.439)"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
