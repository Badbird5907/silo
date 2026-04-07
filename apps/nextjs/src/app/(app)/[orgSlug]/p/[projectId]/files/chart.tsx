"use client";

import { useTRPC } from "@/trpc/react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@silo-storage/ui/components/chart";
import { Skeleton } from "@silo-storage/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Area, AreaChart } from "recharts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface StorageChartProps {
  projectId: string;
  organizationId: string;
  environmentId?: string;
}

interface StorageChartDatum {
  date: string;
  storageBytes: number | null;
}

function formatChartDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function StorageChart({
  projectId,
  organizationId,
  environmentId,
}: StorageChartProps) {
  const storageFillGradientId = `storage-fill-${useId().replace(/:/g, "")}`;

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
    storageBytes: { label: "Stored", color: "var(--chart-4)" },
  };

  const dailyData: StorageChartDatum[] =
    analyticsQuery.data?.daily.map((d) => ({
      date: d.date,
      storageBytes: d.storageBytes as number | null,
    })) ?? [];

  const hasStorageHistory = dailyData.some((d) => d.storageBytes !== null);

  if (analyticsQuery.isLoading) {
    return <Skeleton className="h-[110px] w-full" />;
  }

  if (analyticsQuery.isError) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <p className="text-muted-foreground text-center text-sm">
          Unable to load storage history.
        </p>
      </div>
    );
  }

  if (!hasStorageHistory) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <p className="text-muted-foreground text-center text-sm">
          Storage history starts on the day snapshot tracking was enabled.
        </p>
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[110px]"
    >
      <AreaChart data={dailyData}>
        <defs>
          <linearGradient
            id={storageFillGradientId}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="var(--color-storageBytes)"
              stopOpacity={0.28}
            />
            <stop
              offset="55%"
              stopColor="var(--color-storageBytes)"
              stopOpacity={0.08}
            />
            <stop
              offset="100%"
              stopColor="var(--color-storageBytes)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_value, payload) => {
                const data = payload[0]?.payload as
                  | StorageChartDatum
                  | undefined;
                if (data?.date) {
                  return formatChartDate(data.date);
                }
                return "";
              }}
              formatter={(value, name) => (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {typeof value === "number" ? formatBytes(value) : "Unknown"}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          type="monotone"
          name="Stored"
          dataKey="storageBytes"
          stroke="var(--color-storageBytes)"
          fill={`url(#${storageFillGradientId})`}
        />
      </AreaChart>
    </ChartContainer>
  );
}
