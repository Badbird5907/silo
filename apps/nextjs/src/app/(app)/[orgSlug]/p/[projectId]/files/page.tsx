"use client";

import * as React from "react";
import { use } from "react";
import { notFound, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Filter,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@silo-storage/ui/components/badge";
import { Button } from "@silo-storage/ui/components/button";
import { FileStatusBadge } from "@/components/file-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@silo-storage/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@silo-storage/ui/components/dropdown-menu";
import {
  DataTable,
  useDataTableMultiselect,
} from "@silo-storage/ui/components/data-table";
import type { ColumnDef } from "@silo-storage/ui/components/data-table";
import { Input } from "@silo-storage/ui/components/input";
import { Skeleton } from "@silo-storage/ui/components/skeleton";
import { useIsMobile } from "@silo-storage/ui/hooks/use-mobile";
import { cn } from "@silo-storage/ui/lib/utils";

import type { RouterOutputs } from "@silo-storage/api";

import { getDownloadUrl } from "@/actions/file";
import { UploadDialog } from "@/components/upload-dialog";
import { useOrganization } from "@/hooks/use-organization";
import { useTRPC } from "@/trpc/react";
interface FilesPageProps {
  params: Promise<{
    orgSlug: string;
    projectId: string;
    environment?: string;
  }>;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  const type = mimeType.split("/")[0];
  switch (type) {
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    case "text":
      return FileText;
    case "application":
      if (
        mimeType.includes("zip") ||
        mimeType.includes("tar") ||
        mimeType.includes("rar")
      ) {
        return FileArchive;
      }
      if (
        mimeType.includes("json") ||
        mimeType.includes("javascript") ||
        mimeType.includes("xml")
      ) {
        return FileCode;
      }
      return File;
    default:
      return File;
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function copyToClipboard(text: string, label = "Copied") {
  void navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} to clipboard`);
  });
}

type FileKeyRow = RouterOutputs["fileKey"]["list"]["fileKeys"][number]

interface SearchInputProps {
  value: string;
  onDebouncedChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchInput = React.memo(function SearchInput({
  value,
  onDebouncedChange,
  placeholder = "Search...",
  className,
}: SearchInputProps) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onDebouncedChange(localValue);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localValue, value, onDebouncedChange]);

  return (
    <div
      className={cn(
        "relative w-full min-w-0 max-w-full sm:max-w-sm sm:flex-1",
        className,
      )}
    >
      <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <Input
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="pl-9"
      />
    </div>
  );
});

export default function FilesPage({ params }: FilesPageProps) {
  const trpc = useTRPC();
  const isMobile = useIsMobile();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { projectId, orgSlug, environment: environmentSlug } = use(params);
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? "";

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [search, setSearch] = React.useState("");
  const [mimeTypeFilter, setMimeTypeFilter] = React.useState<string | undefined>();
  const [environmentFilter, setEnvironmentFilter] = React.useState<
    string
  >("all");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "pending" | "completed" | "failed"
  >("completed"); // no need to show pending/failed files by default
  const [sortBy, setSortBy] = React.useState<
    "createdAt" | "size" | "mimeType" | "fileName"
  >("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [deleteFileId, setDeleteFileId] = React.useState<string | null>(null);
  const [failFileId, setFailFileId] = React.useState<string | null>(null);
  const [loadingUrlId, setLoadingUrlId] = React.useState<string | null>(null);
  const multiselect = useDataTableMultiselect<FileKeyRow>((row) => row.id);

  const [bulkAction, setBulkAction] = React.useState<
    "delete" | "markFailed" | "makePublic" | "makePrivate" | null
  >(null);

  const handleSearchChange = React.useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  React.useEffect(() => {
    setPage(1);
  }, [
    mimeTypeFilter,
    environmentFilter,
    statusFilter,
    sortBy,
    sortOrder,
    pageSize,
  ]);

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
  const projectBasePath = selectedEnvironment
    ? `/${orgSlug}/p/${projectId}/e/${selectedEnvironment.slug}`
    : `/${orgSlug}/p/${projectId}`;

  React.useEffect(() => {
    if (selectedEnvironmentId) {
      setEnvironmentFilter(selectedEnvironmentId);
      return;
    }
    if (!environmentSlug) {
      return;
    }
    setEnvironmentFilter("all");
  }, [selectedEnvironmentId, environmentSlug]);
  const environmentId = environmentFilter === "all" ? undefined : environmentFilter;

  const fileKeysQuery = useQuery(
    trpc.fileKey.list.queryOptions(
      {
        organizationId,
        projectId,
        page,
        pageSize,
        search: search || undefined,
        mimeType: mimeTypeFilter,
        environmentId,
        status: statusFilter,
        sortBy,
        sortOrder,
      },
      { enabled: !!organizationId },
    ),
  );

  const filterOptionsQuery = useQuery(
    trpc.fileKey.getFilterOptions.queryOptions(
      { organizationId, projectId, environmentId },
      { enabled: !!organizationId },
    ),
  );

  const statsQuery = useQuery(
    trpc.fileKey.getStats.queryOptions(
      { organizationId, projectId, environmentId },
      { enabled: !!organizationId },
    ),
  );

  const deleteMutation = useMutation(
    trpc.fileKey.delete.mutationOptions({
      onSuccess: () => {
        toast.success("File deleted");
        setDeleteFileId(null);
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.list.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.getStats.queryKey(),
        });
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to delete file");
      },
    }),
  );

  const markFailedMutation = useMutation(
    trpc.fileKey.markFailed.mutationOptions({
      onSuccess: () => {
        toast.success("Upload marked as failed");
        setFailFileId(null);
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.list.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.getStats.queryKey(),
        });
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to mark upload as failed");
      },
    }),
  );

  // Clear selection on page/filter changes
  React.useEffect(() => {
    multiselect.onRowSelectionChange({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, mimeTypeFilter, environmentFilter, statusFilter, sortBy, sortOrder, pageSize]);

  const clearSelection = React.useCallback(() => {
    multiselect.onRowSelectionChange({});
  }, [multiselect]);

  const bulkDeleteMutation = useMutation(
    trpc.fileKey.bulkDelete.mutationOptions({
      onSuccess: (data) => {
        if (data.failed > 0) {
          toast.warning(
            `Deleted ${data.succeeded} of ${data.succeeded + data.failed} files. ${data.failed} failed.`,
          );
        } else {
          toast.success(`Deleted ${data.succeeded} file${data.succeeded !== 1 ? "s" : ""}`);
        }
        setBulkAction(null);
        clearSelection();
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.list.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.getStats.queryKey(),
        });
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to delete files");
      },
    }),
  );

  const bulkMarkFailedMutation = useMutation(
    trpc.fileKey.bulkMarkFailed.mutationOptions({
      onSuccess: (data) => {
        if (data.failed > 0) {
          toast.warning(
            `Marked ${data.succeeded} of ${data.succeeded + data.failed} uploads as failed. ${data.failed} failed.`,
          );
        } else {
          toast.success(
            `Marked ${data.succeeded} upload${data.succeeded !== 1 ? "s" : ""} as failed`,
          );
        }
        setBulkAction(null);
        clearSelection();
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.list.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.getStats.queryKey(),
        });
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to mark uploads as failed");
      },
    }),
  );

  const bulkUpdateAccessMutation = useMutation(
    trpc.fileKey.bulkUpdateAccess.mutationOptions({
      onSuccess: (data) => {
        toast.success(
          `Updated access for ${data.updated} file${data.updated !== 1 ? "s" : ""}`,
        );
        setBulkAction(null);
        clearSelection();
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.list.queryKey(),
        });
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to update file access");
      },
    }),
  );

  const handleBulkAction = () => {
    const ids = multiselect.selectedIds;
    if (ids.length === 0) return;

    switch (bulkAction) {
      case "delete":
        bulkDeleteMutation.mutate({ ids, projectId, organizationId });
        break;
      case "markFailed":
        bulkMarkFailedMutation.mutate({ ids, projectId, organizationId });
        break;
      case "makePublic":
        bulkUpdateAccessMutation.mutate({
          ids,
          projectId,
          organizationId,
          isPublic: true,
        });
        break;
      case "makePrivate":
        bulkUpdateAccessMutation.mutate({
          ids,
          projectId,
          organizationId,
          isPublic: false,
        });
        break;
    }
  };

  const isBulkPending =
    bulkDeleteMutation.isPending ||
    bulkMarkFailedMutation.isPending ||
    bulkUpdateAccessMutation.isPending;

  const handleOpenFile = React.useCallback(
    async (fileKeyId: string) => {
      setLoadingUrlId(fileKeyId);
      try {
        const result = await getDownloadUrl({
          fileKeyId,
          projectId,
          organizationId,
        });
        if (result) {
          window.open(result.url, "_blank");
        } else {
          toast.error("Failed to get download URL");
        }
      } catch {
        toast.error("Failed to get download URL");
      } finally {
        setLoadingUrlId(null);
      }
    },
    [projectId, organizationId],
  );

  const handleDelete = () => {
    if (deleteFileId) {
      deleteMutation.mutate({
        id: deleteFileId,
        projectId,
        organizationId,
      });
    }
  };

  const handleMarkFailed = () => {
    if (failFileId) {
      markFailedMutation.mutate({
        id: failFileId,
        projectId,
        organizationId,
      });
    }
  };

  const columns = React.useMemo<ColumnDef<FileKeyRow>[]>(
    () => [
      {
        id: "file",
        header: "File",
        meta: {
          headerClassName: isMobile ? undefined : "w-[35%]",
        },
        cell: ({ row }) => {
          const fk = row.original;
          const FileIcon = getFileIcon(fk.mimeType);
          return (
            <div className="flex items-center gap-3">
              <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <FileIcon className="text-muted-foreground h-5 w-5" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{fk.fileName}</span>
                {fk.hash ? (
                  <span className="text-muted-foreground truncate font-mono text-xs">
                    {fk.hash.slice(0, 16)}...
                  </span>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        meta: { headerClassName: "w-[100px]" },
        cell: ({ row }) => <FileStatusBadge status={row.original.status} />,
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => {
          const fk = row.original;
          return fk.mimeType ? (
            <Badge variant="outline">{fk.mimeType}</Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        id: "access",
        header: "Access",
        cell: ({ row }) => {
          const fk = row.original;
          return fk.isPublic ? (
            <Badge variant="outline">Public</Badge>
          ) : (
            <Badge variant="outline">Private</Badge>
          );
        },
      },
      {
        id: "size",
        header: "Size",
        cell: ({ row }) => formatFileSize(row.original.size),
      },
      {
        id: "environment",
        header: "Environment",
        cell: ({ row }) => {
          const env = row.original.environment;
          return env ? (
            <Badge
              variant={
                env.type === "production"
                  ? "default"
                  : env.type === "staging"
                    ? "secondary"
                    : "outline"
              }
            >
              {env.name}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[50px]", cellClassName: "w-[50px]" },
        cell: ({ row }) => {
          const fk = row.original;
          const isCompleted = fk.status === "completed";
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-10 w-10 md:h-8 md:w-8"
                  onClick={(e) => e.stopPropagation()}
                >
                  {loadingUrlId === fk.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void handleOpenFile(fk.id)}
                  disabled={!isCompleted}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open File
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    copyToClipboard(fk.accessKey, "Access key copied")
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Access Key
                </DropdownMenuItem>
                {fk.status === "pending" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setFailFileId(fk.id)}
                      className="text-orange-600"
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Mark as Failed
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteFileId(fk.id)}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [handleOpenFile, loadingUrlId, isMobile],
  );

  if (projectQuery.isLoading || !organizationId) {
    return (
      <>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    notFound();
  }
  if (environmentSlug && !environmentsQuery.isLoading && !selectedEnvironment) {
    notFound();
  }

  const fileKeys = fileKeysQuery.data?.fileKeys ?? [];
  const pagination = fileKeysQuery.data?.pagination;
  const filterOptions = filterOptionsQuery.data;
  const stats = statsQuery.data;

  const hasActiveFilters =
    (mimeTypeFilter ?? (environmentFilter !== "all" ? environmentFilter : undefined) ?? statusFilter !== "completed") || search;

  const clearFilters = () => {
    setSearch("");
    setMimeTypeFilter(undefined);
    setEnvironmentFilter("all");
    setStatusFilter("completed");
  };

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <File className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsQuery.isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  (stats?.total.toLocaleString() ?? 0)
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsQuery.isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  (stats?.completed.toLocaleString() ?? 0)
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsQuery.isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  (stats?.pending.toLocaleString() ?? 0)
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsQuery.isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  (stats?.failed.toLocaleString() ?? 0)
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Storage</CardTitle>
              <HardDrive className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsQuery.isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  formatFileSize(stats?.totalSize ?? 0)
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <SearchInput
                value={search}
                onDebouncedChange={handleSearchChange}
                placeholder="Search by filename..."
                className="w-full md:max-w-sm"
              />
              <div className="grid w-full min-w-0 grid-cols-[auto,minmax(0,1fr)] items-center gap-2 md:ml-auto md:flex md:w-auto md:grid-cols-none md:justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="shrink-0 border md:border-none"
                    >
                      <Filter className="h-4 w-4" />
                      <span className="block md:hidden">Filter</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="min-w-[220px] max-w-[calc(100vw-2rem)]"
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Filter by</DropdownMenuLabel>
                      {isMobile ? (
                        <>
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
                          <DropdownMenuRadioGroup value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                            <DropdownMenuRadioItem value="all">
                              All Status
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="completed">
                              Completed
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="pending">
                              Pending
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="failed">
                              Failed
                            </DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Environment</DropdownMenuLabel>
                          <DropdownMenuRadioGroup value={environmentFilter} onValueChange={(v) => setEnvironmentFilter(v)}>
                            <DropdownMenuRadioItem value="all">
                              All Environments
                            </DropdownMenuRadioItem>
                            {filterOptions?.environments.map((env) => (
                              <DropdownMenuRadioItem key={env.id} value={env.id}>
                                {env.name}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Type</DropdownMenuLabel>
                          <DropdownMenuRadioGroup value={mimeTypeFilter} onValueChange={(v) => setMimeTypeFilter(v as typeof mimeTypeFilter)}>
                            <DropdownMenuRadioItem value="all">
                              All Types
                            </DropdownMenuRadioItem>
                            {filterOptions?.mimeTypeCategories.map((type) => (
                              <DropdownMenuRadioItem key={type} value={type}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </>
                      ) : (
                        <>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent>
                                <DropdownMenuRadioGroup value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                                  <DropdownMenuRadioItem value="all">
                                    All Status
                                  </DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="completed">
                                    Completed
                                  </DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="pending">
                                    Pending
                                  </DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="failed">
                                    Failed
                                  </DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Environment</DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent>
                                <DropdownMenuRadioGroup value={environmentFilter} onValueChange={(v) => setEnvironmentFilter(v)}>
                                  <DropdownMenuRadioItem value="all">
                                    All Environments
                                  </DropdownMenuRadioItem>
                                  {filterOptions?.environments.map((env) => (
                                    <DropdownMenuRadioItem key={env.id} value={env.id}>
                                      {env.name}
                                    </DropdownMenuRadioItem>
                                  ))}
                                </DropdownMenuRadioGroup>
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Type</DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent>
                                <DropdownMenuRadioGroup value={mimeTypeFilter} onValueChange={(v) => setMimeTypeFilter(v as typeof mimeTypeFilter)}>
                                  <DropdownMenuRadioItem value="all">
                                    All Types
                                  </DropdownMenuRadioItem>
                                  {filterOptions?.mimeTypeCategories.map((type) => (
                                    <DropdownMenuRadioItem key={type} value={type}>
                                      {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </DropdownMenuRadioItem>
                                  ))}
                                </DropdownMenuRadioGroup>
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        </>
                      )}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters}>
                      Clear Filters
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Sort by</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={`${sortBy}-${sortOrder}`}
                      onValueChange={(v) => {
                        const [field, order] = v.split("-") as [
                          typeof sortBy,
                          typeof sortOrder,
                        ];
                        setSortBy(field);
                        setSortOrder(order);
                      }}>
                      <DropdownMenuRadioItem value="createdAt-desc">Newest First</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="createdAt-asc">Oldest First</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="fileName-asc">Name A-Z</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="fileName-desc">Name Z-A</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="size-desc">Largest First</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="size-asc">Smallest First</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <UploadDialog
                  projectId={projectId}
                  defaultEnvironmentId={selectedEnvironmentId}
                  environments={
                    filterOptions?.environments.map((env) => ({
                      id: env.id,
                      name: env.name,
                      type: env.type,
                    })) ?? []
                  }
                  onUploadComplete={() => {
                    void fileKeysQuery.refetch();
                    void statsQuery.refetch();
                  }}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="min-w-0">
            <DataTable
              columns={columns}
              data={fileKeys}
              multiselect
              {...multiselect}
              loading={fileKeysQuery.isLoading}
              emptyMessage={
                hasActiveFilters
                  ? "No files found. Try adjusting your filters."
                  : "No files found. Upload some files to get started."
              }
              emptyIcon={File}
              onRowClick={(row) =>
                router.push(`${projectBasePath}/files/${row.id}`)
              }
              pagination={
                pagination
                  ? {
                    ...pagination,
                    onPageChange: setPage,
                    onPageSizeChange: setPageSize,
                  }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={deleteFileId !== null}
        onOpenChange={(open) => !open && setDeleteFileId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this file? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteFileId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={failFileId !== null}
        onOpenChange={(open) => !open && setFailFileId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Upload as Failed</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this upload as failed? This will
              abort the upload and any partial data will be cleaned up.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFailFileId(null)}
              disabled={markFailedMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleMarkFailed}
              disabled={markFailedMutation.isPending}
            >
              {markFailedMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Mark as Failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkAction !== null}
        onOpenChange={(open) => !open && setBulkAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkAction === "delete" && "Delete Files"}
              {bulkAction === "markFailed" && "Mark Uploads as Failed"}
              {bulkAction === "makePublic" && "Make Files Public"}
              {bulkAction === "makePrivate" && "Make Files Private"}
            </DialogTitle>
            <DialogDescription>
              {bulkAction === "delete" &&
                `Are you sure you want to delete ${multiselect.selectedIds.length} file${multiselect.selectedIds.length !== 1 ? "s" : ""}? This action cannot be undone.`}
              {bulkAction === "markFailed" &&
                `Are you sure you want to mark ${multiselect.selectedIds.length} upload${multiselect.selectedIds.length !== 1 ? "s" : ""} as failed? This will abort the uploads and any partial data will be cleaned up.`}
              {bulkAction === "makePublic" &&
                `Are you sure you want to make ${multiselect.selectedIds.length} file${multiselect.selectedIds.length !== 1 ? "s" : ""} publicly accessible?`}
              {bulkAction === "makePrivate" &&
                `Are you sure you want to make ${multiselect.selectedIds.length} file${multiselect.selectedIds.length !== 1 ? "s" : ""} private?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkAction(null)}
              disabled={isBulkPending}
            >
              Cancel
            </Button>
            <Button
              variant={
                bulkAction === "delete" || bulkAction === "markFailed"
                  ? "destructive"
                  : "default"
              }
              onClick={handleBulkAction}
              disabled={isBulkPending}
            >
              {isBulkPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {bulkAction === "delete" && "Delete"}
              {bulkAction === "markFailed" && "Mark as Failed"}
              {bulkAction === "makePublic" && "Make Public"}
              {bulkAction === "makePrivate" && "Make Private"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating bulk action bar */}
      {multiselect.selectedIds.length > 0 && (
        <div className="bg-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">
            {multiselect.selectedIds.length} selected
          </span>
          <div className="bg-border mx-1 h-4 w-px" />
          {(() => {
            const selectedRows = multiselect.getSelectedRows(fileKeys);
            const hasPending = selectedRows.some((r) => r.status === "pending");
            return (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkAction("delete")}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
                {hasPending && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-orange-600 hover:text-orange-600"
                    onClick={() => setBulkAction("markFailed")}
                  >
                    <Ban className="mr-1.5 h-3.5 w-3.5" />
                    Mark Failed
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkAction("makePublic")}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Make Public
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkAction("makePrivate")}
                >
                  <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                  Make Private
                </Button>
              </>
            );
          })()}
          <div className="bg-border mx-1 h-4 w-px" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearSelection}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </>
  );
}
