"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@silo-storage/ui/components/chart";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { useTRPC } from "@/trpc/react";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const [{ startDate, endDate }] = useState(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * MS_PER_DAY);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  });

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
        <Bar
          dataKey="uploadsCompleted"
          fill="var(--color-uploadsCompleted)"
          radius={[2, 2, 0, 0]}
        />
        <Bar
          dataKey="uploadsFailed"
          fill="var(--color-uploadsFailed)"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
