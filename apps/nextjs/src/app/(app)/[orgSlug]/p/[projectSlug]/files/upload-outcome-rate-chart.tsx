"use client";

import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@silo-storage/ui/components/chart";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { useTRPC } from "@/trpc/react";
import { getFilesDashboardDateRange } from "./chart-timeframe";

interface UploadOutcomeRateChartProps {
  projectId: string;
  organizationId: string;
  environmentId?: string;
}

interface UploadOutcomeRateDatum {
  date: string;
  uploadsCompleted: number;
  uploadsFailed: number;
  successRate: number | null;
  failureRate: number | null;
}

function formatChartDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function UploadOutcomeRateChart({
  projectId,
  organizationId,
  environmentId,
}: UploadOutcomeRateChartProps) {
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

  const dailyData: UploadOutcomeRateDatum[] = (() => {
    const daily = analyticsQuery.data?.daily ?? [];
    return daily.reduce<{
      rows: UploadOutcomeRateDatum[];
      lastSuccessRate: number | null;
      lastFailureRate: number | null;
    }>(
      (acc, d) => {
        const outcomes = d.uploadsCompleted + d.uploadsFailed;
        const hasOutcomes = outcomes > 0;
        const successRate = hasOutcomes
          ? (d.uploadsCompleted / outcomes) * 100
          : acc.lastSuccessRate;
        const failureRate = hasOutcomes
          ? (d.uploadsFailed / outcomes) * 100
          : acc.lastFailureRate;

        // we want to fill in the missing values
        // where there are no uploads in a day
        return {
          rows: [
            ...acc.rows,
            {
              date: d.date,
              uploadsCompleted: d.uploadsCompleted,
              uploadsFailed: d.uploadsFailed,
              successRate,
              failureRate,
            },
          ],
          lastSuccessRate: hasOutcomes ? successRate : acc.lastSuccessRate,
          lastFailureRate: hasOutcomes ? failureRate : acc.lastFailureRate,
        };
      },
      { rows: [], lastSuccessRate: null, lastFailureRate: null },
    ).rows;
  })();
  const startDateLabel = dailyData[0]?.date;
  const endDateLabel = dailyData[dailyData.length - 1]?.date;
  const tickDates =
    startDateLabel && endDateLabel
      ? startDateLabel === endDateLabel
        ? [startDateLabel]
        : [startDateLabel, endDateLabel]
      : [];

  const hasOutcomes = dailyData.some(
    (d) => d.uploadsCompleted > 0 || d.uploadsFailed > 0,
  );

  if (analyticsQuery.isLoading) {
    return <Skeleton className="h-[110px] w-full" />;
  }

  if (analyticsQuery.isError) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <p className="text-muted-foreground text-center text-sm">
          Unable to load upload outcome rates.
        </p>
      </div>
    );
  }

  if (!hasOutcomes) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <p className="text-muted-foreground text-center text-sm">
          No upload outcomes in the last 7 days.
        </p>
      </div>
    );
  }

  return (
    <ChartContainer
      config={{
        successRate: { label: "Success rate", color: "#00FF9A" },
        failureRate: { label: "Failure rate", color: "#FF2002" },
      }}
      className="aspect-auto h-[110px]"
    >
      <LineChart data={dailyData}>
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_value, payload) => {
                const data = payload[0]?.payload as
                  | UploadOutcomeRateDatum
                  | undefined;
                if (data?.date) {
                  return formatChartDate(data.date);
                }
                return "";
              }}
              formatter={(value, name, _item, _index, payload) => {
                const data = payload as unknown as
                  | UploadOutcomeRateDatum
                  | undefined;
                const count =
                  name === "Success rate"
                    ? data?.uploadsCompleted
                    : name === "Failure rate"
                      ? data?.uploadsFailed
                      : undefined;

                return (
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {typeof value === "number"
                        ? `${formatPercent(value)}${typeof count === "number" ? ` (${count})` : ""}`
                        : "-"}
                    </span>
                  </div>
                );
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
        <Line
          type="monotone"
          dataKey="successRate"
          name="Success rate"
          stroke="oklch(69.6% 0.17 162.48)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="failureRate"
          name="Failure rate"
          stroke="oklch(64.5% 0.246 16.439)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  );
}
