"use client";

import type { RouterOutputs } from "@silo-storage/api";
import type { ColumnDef } from "@silo-storage/ui/components/data-table";
import * as React from "react";
import { use } from "react";
import {
  notFound,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";

import {
  auditEventCategories,
  auditEventCodeOptions,
  auditResourceTypes,
} from "@silo-storage/shared";
import { Badge } from "@silo-storage/ui/components/badge";
import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";
import { DataTable } from "@silo-storage/ui/components/data-table";
import { DateRangePicker } from "@silo-storage/ui/components/date-range-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@silo-storage/ui/components/dialog";
import { Input } from "@silo-storage/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silo-storage/ui/components/select";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { useOrganization } from "@/hooks/use-organization";
import {
  formatAuditTimestamp,
  formatAuditValue,
  formatBytes,
  getAuditCategoryLabel,
  getAuditEventBgColor,
  getAuditEventColor,
  getAuditEventIcon,
  getAuditEventLabel,
  getAuditResourceTypeLabel,
} from "@/lib/audit";
import { useTRPC } from "@/trpc/react";

type AuditEventRow = RouterOutputs["audit"]["list"]["events"][number];
type AuditListData = RouterOutputs["audit"]["list"];

interface AuditPageProps {
  params: Promise<{
    orgSlug: string;
    projectId: string;
    environment?: string;
  }>;
}

interface PickerDateRange {
  from?: Date;
  to?: Date;
}

function AuditPageSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
          <Skeleton className="h-[460px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateParam(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getEventDetails(event: AuditEventRow): string {
  const bytes =
    typeof event.metadata.bytes === "number"
      ? formatBytes(event.metadata.bytes)
      : null;
  if (bytes) {
    return bytes;
  }
  if (event.changes.length > 0) {
    return `${event.changes.length} change${event.changes.length === 1 ? "" : "s"}`;
  }
  return event.status === "failure" ? "Failed" : "—";
}

export default function AuditPage({ params }: AuditPageProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? "";

  const { projectId, environment: environmentSlug } = use(params);

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20);
  const category = searchParams.get("category") ?? "all";
  const eventCode = searchParams.get("event") ?? "all";
  const resourceType = searchParams.get("resource") ?? "all";
  const environmentFilter = searchParams.get("env") ?? "all";
  const startDateParam = searchParams.get("start");
  const endDateParam = searchParams.get("end");
  const urlSearchQuery = searchParams.get("q") ?? "";
  const urlActorQuery = searchParams.get("actor") ?? "";
  const urlClientIpQuery = searchParams.get("ip") ?? "";

  const lastAppliedSearchQueryRef = React.useRef(urlSearchQuery);
  const lastAppliedActorQueryRef = React.useRef(urlActorQuery);
  const lastAppliedClientIpQueryRef = React.useRef(urlClientIpQuery);
  const [searchQuery, setSearchQuery] = React.useState(urlSearchQuery);
  const [actorQuery, setActorQuery] = React.useState(urlActorQuery);
  const [clientIpQuery, setClientIpQuery] = React.useState(urlClientIpQuery);
  const [debouncedSearch] = useDebounce(searchQuery, 400);
  const [debouncedActor] = useDebounce(actorQuery, 400);
  const [debouncedClientIp] = useDebounce(clientIpQuery, 400);
  const [selectedEvent, setSelectedEvent] =
    React.useState<AuditEventRow | null>(null);

  React.useEffect(() => {
    if (urlSearchQuery !== lastAppliedSearchQueryRef.current) {
      lastAppliedSearchQueryRef.current = urlSearchQuery;
      setSearchQuery(urlSearchQuery);
    }
  }, [urlSearchQuery]);

  React.useEffect(() => {
    if (urlActorQuery !== lastAppliedActorQueryRef.current) {
      lastAppliedActorQueryRef.current = urlActorQuery;
      setActorQuery(urlActorQuery);
    }
  }, [urlActorQuery]);

  React.useEffect(() => {
    if (urlClientIpQuery !== lastAppliedClientIpQueryRef.current) {
      lastAppliedClientIpQueryRef.current = urlClientIpQuery;
      setClientIpQuery(urlClientIpQuery);
    }
  }, [urlClientIpQuery]);

  const updateQueryParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      let changed = false;

      for (const [key, value] of Object.entries(updates)) {
        const currentValue = params.get(key);
        if (!value) {
          if (currentValue !== null) {
            params.delete(key);
            changed = true;
          }
          continue;
        }
        if (currentValue !== value) {
          params.set(key, value);
          changed = true;
        }
      }

      if (!changed) {
        return;
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    if (debouncedSearch !== urlSearchQuery) {
      lastAppliedSearchQueryRef.current = debouncedSearch;
      updateQueryParams({
        q: debouncedSearch || null,
        page: "1",
      });
    }
  }, [debouncedSearch, updateQueryParams, urlSearchQuery]);

  React.useEffect(() => {
    if (debouncedActor !== urlActorQuery) {
      lastAppliedActorQueryRef.current = debouncedActor;
      updateQueryParams({
        actor: debouncedActor || null,
        page: "1",
      });
    }
  }, [debouncedActor, updateQueryParams, urlActorQuery]);

  React.useEffect(() => {
    if (debouncedClientIp !== urlClientIpQuery) {
      lastAppliedClientIpQueryRef.current = debouncedClientIp;
      updateQueryParams({
        ip: debouncedClientIp || null,
        page: "1",
      });
    }
  }, [debouncedClientIp, updateQueryParams, urlClientIpQuery]);

  const projectQuery = useQuery(
    trpc.project.getById.queryOptions(
      { id: projectId, organizationId },
      { enabled: !!organizationId && !!projectId },
    ),
  );

  const environmentsQuery = useQuery(
    trpc.environment.list.queryOptions(
      { projectId, organizationId },
      { enabled: !!organizationId && !!projectId },
    ),
  );

  const environments = React.useMemo(
    () => environmentsQuery.data ?? [],
    [environmentsQuery.data],
  );
  const selectedEnvironment = environments.find(
    (env) => env.slug === environmentSlug,
  );

  const selectedEnvironmentId = selectedEnvironment?.id;
  const filteredEnvironmentId =
    !selectedEnvironmentId &&
    environmentFilter !== "all" &&
    environments.some((environment) => environment.id === environmentFilter)
      ? environmentFilter
      : undefined;
  const effectiveEnvironmentId = selectedEnvironmentId ?? filteredEnvironmentId;

  const dateRange = React.useMemo(() => {
    const from = parseDate(startDateParam);
    const to = parseDate(endDateParam);
    if (!from && !to) {
      return undefined;
    }
    return {
      from,
      to: to ?? from,
    };
  }, [endDateParam, startDateParam]);

  const auditQuery = useQuery(
    trpc.audit.list.queryOptions(
      {
        organizationId,
        projectId,
        environmentId: effectiveEnvironmentId,
        page,
        pageSize,
        search: debouncedSearch || undefined,
        actor: debouncedActor ? { label: debouncedActor } : undefined,
        clientIp: debouncedClientIp || undefined,
        eventCategory:
          category !== "all"
            ? (category as (typeof auditEventCategories)[number])
            : undefined,
        eventCode:
          eventCode !== "all"
            ? (eventCode as (typeof auditEventCodeOptions)[number])
            : undefined,
        resourceType:
          resourceType !== "all"
            ? (resourceType as (typeof auditResourceTypes)[number])
            : undefined,
        startDate: startDateParam ?? undefined,
        endDate: endDateParam ?? undefined,
      },
      { enabled: !!organizationId && !!projectId },
    ),
  );

  React.useEffect(() => {
    if (selectedEnvironmentId && environmentFilter !== "all") {
      updateQueryParams({ env: null });
    }
  }, [environmentFilter, selectedEnvironmentId, updateQueryParams]);

  React.useEffect(() => {
    if (
      selectedEnvironmentId ||
      environmentFilter === "all" ||
      environmentsQuery.isLoading
    ) {
      return;
    }

    if (
      !environments.some((environment) => environment.id === environmentFilter)
    ) {
      updateQueryParams({ env: null, page: "1" });
    }
  }, [
    environmentFilter,
    environments,
    environmentsQuery.isLoading,
    selectedEnvironmentId,
    updateQueryParams,
  ]);

  if (projectQuery.isLoading || !organizationId) {
    return <AuditPageSkeleton />;
  }

  if (projectQuery.error || !projectQuery.data) {
    notFound();
  }

  if (environmentSlug && !environmentsQuery.isLoading && !selectedEnvironment) {
    notFound();
  }

  const auditDataResult = auditQuery.data;
  const auditData: AuditListData = auditDataResult ?? {
    events: [],
    pagination: {
      page,
      pageSize,
      totalCount: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  const auditErrorMessage = auditQuery.error?.message;
  const rows = auditData.events;
  const pagination = auditData.pagination;
  const hasActiveFilters = [
    searchParams.get("q"),
    searchParams.get("actor"),
    searchParams.get("ip"),
    searchParams.get("category"),
    searchParams.get("event"),
    searchParams.get("resource"),
    searchParams.get("env"),
    searchParams.get("start"),
    searchParams.get("end"),
  ].some((value) => value !== null);

  const columns: ColumnDef<AuditEventRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Timestamp",
      meta: {
        headerClassName: "w-[148px]",
        cellClassName: "w-[148px]",
      },
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {formatAuditTimestamp(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "action",
      header: "Action",
      meta: {
        headerClassName: "w-[30%]",
        cellClassName: "max-w-0 w-[30%]",
      },
      cell: ({ row }) => {
        const event = row.original;
        const Icon = getAuditEventIcon(event.eventCode);
        const colorClass = getAuditEventColor(event.eventCode);
        const bgColorClass = getAuditEventBgColor(event.eventCode);
        const title = getAuditEventLabel(event.eventCode);
        return (
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bgColorClass} ${colorClass}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="truncate font-medium" title={title}>
                {title}
              </div>
              <div
                className="text-muted-foreground truncate text-xs"
                title={event.summary}
              >
                {event.summary}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "resource",
      header: "Resource",
      meta: {
        headerClassName: "w-[22%]",
        cellClassName: "max-w-0 w-[22%]",
      },
      cell: ({ row }) => {
        const label = row.original.resource.label ?? "—";
        return (
          <div className="min-w-0 space-y-1">
            <div
              className="truncate font-medium"
              title={label === "—" ? undefined : label}
            >
              {label}
            </div>
            <Badge variant="outline">
              {getAuditResourceTypeLabel(row.original.resource.type)}
            </Badge>
          </div>
        );
      },
    },
    {
      id: "actor",
      header: "Actor",
      meta: {
        headerClassName: "w-[16%]",
        cellClassName: "max-w-0 w-[16%]",
      },
      cell: ({ row }) => {
        const actorLabel = row.original.actor.label ?? "Unknown";
        return (
          <div className="min-w-0 space-y-1">
            <div className="truncate font-medium" title={actorLabel}>
              {actorLabel}
            </div>
            <div className="text-muted-foreground truncate text-xs">
              {row.original.actor.type.replace("_", " ")}
            </div>
          </div>
        );
      },
    },
    {
      id: "environment",
      header: "Environment",
      meta: {
        headerClassName: "w-[12%]",
        cellClassName: "max-w-0 w-[12%]",
      },
      cell: ({ row }) =>
        row.original.environment ? (
          <div className="min-w-0 space-y-1">
            <div
              className="truncate font-medium"
              title={row.original.environment.name}
            >
              {row.original.environment.name}
            </div>
            <div
              className="text-muted-foreground truncate text-xs"
              title={row.original.environment.slug}
            >
              {row.original.environment.slug}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "details",
      header: "Details",
      meta: { cellClassName: "max-w-0" },
      cell: ({ row }) => {
        const details = getEventDetails(row.original);
        return (
          <div className="min-w-0 space-y-1">
            <Badge
              variant={
                row.original.status === "failure" ? "destructive" : "secondary"
              }
            >
              {getAuditCategoryLabel(row.original.eventCategory)}
            </Badge>
            <div
              className="text-muted-foreground truncate text-xs"
              title={details}
            >
              {details}
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground text-sm">
          Project activity, configuration changes, and security events.
        </p>
      </div>

      <Card className="gap-3 md:gap-4">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Narrow the audit trail by actor, event type, resource,
              environment, or date.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:items-center sm:justify-between md:flex-row lg:w-auto lg:items-end">
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-8 px-0 sm:px-3"
                onClick={() =>
                  updateQueryParams({
                    q: null,
                    actor: null,
                    ip: null,
                    category: null,
                    event: null,
                    resource: null,
                    env: null,
                    start: null,
                    end: null,
                    page: "1",
                  })
                }
              >
                Clear filters
              </Button>
            ) : null}
            <div className="w-full sm:w-auto lg:min-w-[320px]">
              <DateRangePicker
                className="w-full lg:w-[320px]"
                value={dateRange}
                defaultMonth={dateRange?.from}
                onChange={(range: PickerDateRange | undefined) => {
                  updateQueryParams({
                    start: range?.from ? formatDateParam(range.from) : null,
                    end: range?.to
                      ? formatDateParam(range.to)
                      : range?.from
                        ? formatDateParam(range.from)
                        : null,
                    page: "1",
                  });
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          {auditErrorMessage ? (
            <div className="border-destructive/50 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
              Failed to load audit events. {auditErrorMessage}
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-8">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search actions or resources"
              className="col-span-2"
            />
            <Input
              value={actorQuery}
              onChange={(event) => setActorQuery(event.target.value)}
              placeholder="Filter by actor"
              className="col-span-2 md:col-span-1"
            />
            <Input
              value={clientIpQuery}
              onChange={(event) => setClientIpQuery(event.target.value)}
              placeholder="Client IP (exact match)"
              className="col-span-2 md:col-span-1"
            />
            <Select
              value={category}
              onValueChange={(value) =>
                updateQueryParams({
                  category: value === "all" ? null : value,
                  page: "1",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent searchable>
                <SelectItem value="all">All categories</SelectItem>
                {auditEventCategories.map((value) => (
                  <SelectItem key={value} value={value}>
                    {getAuditCategoryLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={eventCode}
              onValueChange={(value) =>
                updateQueryParams({
                  event: value === "all" ? null : value,
                  page: "1",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent searchable>
                <SelectItem value="all">All event types</SelectItem>
                {auditEventCodeOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {getAuditEventLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={resourceType}
              onValueChange={(value) =>
                updateQueryParams({
                  resource: value === "all" ? null : value,
                  page: "1",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Resource" />
              </SelectTrigger>
              <SelectContent searchable>
                <SelectItem value="all">All resources</SelectItem>
                {auditResourceTypes.map((value) => (
                  <SelectItem key={value} value={value}>
                    {getAuditResourceTypeLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedEnvironmentId ? (
              <Select
                value={environmentFilter}
                onValueChange={(value) =>
                  updateQueryParams({
                    env: value === "all" ? null : value,
                    page: "1",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Environment" />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="all">All environments</SelectItem>
                  {environments.map((environment) => (
                    <SelectItem key={environment.id} value={environment.id}>
                      {environment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="bg-muted/50 text-muted-foreground flex cursor-not-allowed items-center truncate rounded-md border px-3 text-sm">
                {selectedEnvironment.name}
              </div>
            )}
          </div>

          <DataTable
            columns={columns}
            data={rows}
            loading={auditQuery.isLoading}
            emptyMessage={
              hasActiveFilters
                ? "No audit events found. Try adjusting your filters."
                : "No audit events yet."
            }
            onRowClick={(row) => setSelectedEvent(row)}
            pagination={{
              ...pagination,
              onPageChange: (nextPage) =>
                updateQueryParams({ page: `${nextPage}` }),
              onPageSizeChange: (nextPageSize) =>
                updateQueryParams({
                  pageSize: `${nextPageSize}`,
                  page: "1",
                }),
            }}
          />
        </CardContent>
      </Card>

      <Dialog
        open={selectedEvent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEvent(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedEvent
                ? getAuditEventLabel(selectedEvent.eventCode)
                : "Audit event"}
            </DialogTitle>
            <DialogDescription>
              {selectedEvent?.summary ?? "Event details"}
            </DialogDescription>
          </DialogHeader>

          {selectedEvent ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-muted-foreground text-xs">Timestamp</div>
                  <div className="font-medium">
                    {formatAuditTimestamp(selectedEvent.createdAt)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Actor</div>
                  <div className="font-medium">
                    {selectedEvent.actor.label ?? "Unknown"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Category</div>
                  <div className="font-medium">
                    {getAuditCategoryLabel(selectedEvent.eventCategory)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Resource</div>
                  <div className="font-medium">
                    {selectedEvent.resource.label ?? "—"}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {getAuditResourceTypeLabel(selectedEvent.resource.type)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    Environment
                  </div>
                  <div className="font-medium">
                    {selectedEvent.environment?.name ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Status</div>
                  <div className="font-medium">{selectedEvent.status}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Client IP</div>
                  <div className="font-medium">
                    {selectedEvent.clientIp ?? "—"}
                  </div>
                </div>
              </div>

              {selectedEvent.changes.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Changed Fields</h3>
                  <div className="space-y-2">
                    {selectedEvent.changes.map((change) => (
                      <div key={change.path} className="rounded-md border p-3">
                        <div className="mb-2 text-sm font-medium">
                          {change.path}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-muted-foreground text-xs">
                              Before
                            </div>
                            <pre className="bg-muted mt-1 rounded-md p-2 text-xs whitespace-pre-wrap">
                              {formatAuditValue(change.before)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">
                              After
                            </div>
                            <pre className="bg-muted mt-1 rounded-md p-2 text-xs whitespace-pre-wrap">
                              {formatAuditValue(change.after)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Metadata</h3>
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
