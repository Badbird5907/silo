"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Calendar,
  Copy,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Globe,
  HardDrive,
  Hash,
  Key,
  Loader2,
  Lock,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@silo-storage/ui/components/badge";
import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Label } from "@silo-storage/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silo-storage/ui/components/select";
import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { getDownloadUrl } from "@/actions/file";
import { FileStatusBadge } from "@/components/file-status-badge";
import { useOrganization } from "@/hooks/use-organization";
import { useTRPC } from "@/trpc/react";

interface FileDetailPageProps {
  params: Promise<{
    orgSlug: string;
    projectId: string;
    fileId: string;
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
      // if (mimeType.includes("pdf")) {
      //   return FilePdf;
      // }
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

function copyToClipboard(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied to clipboard`);
  });
}

type AccessValue = "public" | "private";

export default function FileDetailPage({ params }: FileDetailPageProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    fileId,
    projectId,
    orgSlug,
    environment: environmentSlug,
  } = use(params);
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? "";

  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showMarkFailedDialog, setShowMarkFailedDialog] = React.useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = React.useState(false);

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
  const projectBasePath = selectedEnvironment
    ? `/${orgSlug}/p/${projectId}/e/${selectedEnvironment.slug}`
    : `/${orgSlug}/p/${projectId}`;

  const fileKeyQuery = useQuery(
    trpc.fileKey.getById.queryOptions(
      { id: fileId, projectId, organizationId },
      { enabled: !!organizationId },
    ),
  );

  const updateAccessMutation = useMutation(
    trpc.fileKey.updateAccess.mutationOptions({
      onSuccess: () => {
        toast.success("File access updated");
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.getById.queryKey({
            id: fileId,
            projectId,
            organizationId,
          }),
        });
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to update file access");
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.fileKey.delete.mutationOptions({
      onSuccess: () => {
        toast.success("File deleted");
        router.push(`${projectBasePath}/files`);
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
        setShowMarkFailedDialog(false);
        void queryClient.invalidateQueries({
          queryKey: trpc.fileKey.getById.queryKey({
            id: fileId,
            projectId,
            organizationId,
          }),
        });
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to mark upload as failed");
      },
    }),
  );

  const handleGetUrl = async () => {
    setIsLoadingUrl(true);
    try {
      const result = await getDownloadUrl({
        fileKeyId: fileId,
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
      setIsLoadingUrl(false);
    }
  };

  const handleAccessChange = (value: AccessValue) => {
    updateAccessMutation.mutate({
      id: fileId,
      projectId,
      organizationId,
      isPublic: value === "public",
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({
      id: fileId,
      projectId,
      organizationId,
    });
  };

  const handleMarkFailed = () => {
    markFailedMutation.mutate({
      id: fileId,
      projectId,
      organizationId,
    });
  };

  if (projectQuery.isLoading || fileKeyQuery.isLoading || !organizationId) {
    return (
      <>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    notFound();
  }

  if (fileKeyQuery.error || !fileKeyQuery.data) {
    notFound();
  }
  if (environmentSlug && !environmentsQuery.isLoading && !selectedEnvironment) {
    notFound();
  }

  const fileKey = fileKeyQuery.data;
  const status = fileKey.status;
  const mimeType = fileKey.file?.mimeType ?? fileKey.claimedMimeType;
  const size = fileKey.file?.size ?? fileKey.claimedSize;
  const hash = fileKey.file?.hash ?? fileKey.claimedHash;
  const FileIcon = getFileIcon(mimeType);
  const effectiveAccess: AccessValue = fileKey.isPublic ? "public" : "private";
  const isPublic = fileKey.isPublic;
  const expiresAt = fileKey.expiresAt
    ? new Date(fileKey.expiresAt)
    : null;
  const isExpired =
    !!expiresAt &&
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt.getTime() <= Date.now();

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`${projectBasePath}/files`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-lg">
              <FileIcon className="text-muted-foreground h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{fileKey.fileName}</h1>
              <p className="text-muted-foreground text-sm">
                {formatFileSize(size)}
                {mimeType && ` • ${mimeType}`}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleGetUrl}
              disabled={status !== "completed" || isLoadingUrl}
            >
              {isLoadingUrl ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Open File
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">File Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground">Status</span>
                </div>
                <FileStatusBadge status={status} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground">Size</span>
                </div>
                <span className="text-sm font-medium">
                  {formatFileSize(size)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <File className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground">Type</span>
                </div>
                <span className="text-sm font-medium">{mimeType ?? "-"}</span>
              </div>
              {hash && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="text-muted-foreground h-4 w-4" />
                    <span className="text-muted-foreground">Hash</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 font-mono text-xs"
                    onClick={() => copyToClipboard(hash, "Hash")}
                  >
                    {hash.slice(0, 12)}...
                    <Copy className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground">Environment</span>
                </div>
                <Badge
                  variant={
                    fileKey.environment.type === "production"
                      ? "default"
                      : fileKey.environment.type === "staging"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {fileKey.environment.name}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground">Created</span>
                </div>
                <span className="text-sm">{formatDate(fileKey.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground">Expires</span>
                </div>
                {expiresAt ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{formatDate(expiresAt)}</span>
                    {isExpired && <Badge variant="destructive">Expired</Badge>}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Never</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access Keys</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Key className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground">File Key ID</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between font-mono text-xs"
                  onClick={() => copyToClipboard(fileKey.id, "File Key ID")}
                >
                  {fileKey.id}
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Key className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground">Access Key</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between font-mono text-xs"
                  onClick={() =>
                    copyToClipboard(fileKey.accessKey, "Access Key")
                  }
                >
                  {fileKey.accessKey}
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access Control</CardTitle>
            <CardDescription>Control who can access this file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Current Access</Label>
                <div className="flex items-center gap-2">
                  {isPublic ? (
                    <>
                      <Globe className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-600">Public</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-yellow-600">Private</span>
                    </>
                  )}
                </div>
              </div>
              <Select
                value={effectiveAccess}
                onValueChange={(v) => handleAccessChange(v as AccessValue)}
                disabled={updateAccessMutation.isPending}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-xs">
              {isPublic
                ? "Anyone with the link can access this file"
                : "A signed URL is required to access this file"}
            </p>
          </CardContent>
        </Card>

        {Object.keys(fileKey.metadata as object).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted overflow-auto rounded-md p-4 text-sm">
                {JSON.stringify(fileKey.metadata, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-base text-red-600">
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions for this file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "pending" && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Mark upload as failed</p>
                  <p className="text-muted-foreground text-sm">
                    Abort this pending upload and clean up any partial data
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:hover:bg-orange-950"
                  onClick={() => setShowMarkFailedDialog(true)}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Mark as Failed
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete this file</p>
                <p className="text-muted-foreground text-sm">
                  Permanently delete this file and all associated data
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete File
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{fileKey.fileName}"? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
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
        open={showMarkFailedDialog}
        onOpenChange={setShowMarkFailedDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Upload as Failed</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark the upload for "{fileKey.fileName}"
              as failed? This will abort the upload and any partial data will be
              cleaned up.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMarkFailedDialog(false)}
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
    </>
  );
}
