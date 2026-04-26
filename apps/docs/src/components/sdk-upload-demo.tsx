"use client";

import type { ListFilesResult, SiloFileSummary } from "@silo-storage/sdk-core";
import * as React from "react";
import { Show, SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2, RefreshCcw, UploadIcon } from "lucide-react";

import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";

import { UploadDropzone, useUpload } from "@/lib/sdk-demo/upload";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

interface MyFilesApiResponse {
  data: ListFilesResult;
}

async function fetchMyFiles(): Promise<SiloFileSummary[]> {
  const response = await fetch("/api/sdk-demo/my-files?page=1&pageSize=25", {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | MyFilesApiResponse
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Failed to list files";

    throw new Error(message);
  }

  const listResult =
    payload && "data" in payload ? payload.data : { files: [] };
  return listResult.files;
}

function formatBytes(value: number | null): string {
  if (!value || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`;
  return `${Math.round(value / (1024 * 102.4)) / 10} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString();
}

function FileRow({ file }: { file: SiloFileSummary }) {
  const statusColor =
    file.status === "completed"
      ? "text-emerald-600"
      : file.status === "failed"
        ? "text-red-500"
        : file.status === "deleted"
          ? "text-slate-500"
          : "text-amber-600";
  const url =
    file.status === "completed"
      ? (file as unknown as { url: string }).url
      : null;

  return (
    <li className="overflow-hidden rounded-lg border p-3">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
        <div className="min-w-0">
          <p className="truncate font-medium">{file.fileName}</p>
          <p className="text-fd-muted-foreground text-xs">
            {file.mimeType ?? "unknown"} - {formatBytes(file.size)}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium ${statusColor}`}>
          {file.status}
        </span>
      </div>

      <div className="mt-2 flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="text-fd-muted-foreground min-w-0 space-y-1 text-xs">
          <p>
            Uploaded: {formatDate(file.uploadCompletedAt ?? file.createdAt)}
          </p>
          <p>
            Expires: {file.expiresAt ? formatDate(file.expiresAt) : "Never"}
          </p>
          <p className="break-all">fileKeyId: {file.id}</p>
        </div>
        {url && (
          <Dialog>
            <DialogTrigger render={<Button variant="outline" size="icon-sm" />}>
              <Eye />
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="break-words pr-8">
                  {file.fileName}
                </DialogTitle>
                <DialogDescription className="break-words">
                  {file.mimeType ?? "unknown"} - {formatBytes(file.size)}
                </DialogDescription>
              </DialogHeader>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={file.fileName}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </li>
  );
}

export function SdkUploadDemo() {
  const { userId, isLoaded } = useAuth();
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const myFilesQuery = useQuery({
    queryKey: ["sdk-demo-files", userId],
    queryFn: fetchMyFiles,
    enabled: Boolean(isLoaded && userId),
  });

  const files = myFilesQuery.data ?? [];
  const listError =
    uploadError ??
    (myFilesQuery.error instanceof Error ? myFilesQuery.error.message : null);

  const upload = useUpload({
    endpoint: "imageUploader",
    onComplete: (result) => {
      console.log("onComplete", result);
      setUploadError(null);
      void myFilesQuery.refetch();
    },
    onError: (error) => {
      setUploadError(error.message);
    },
  });

  return (
    <div className="not-prose grid gap-6">
      <Show when="signed-out">
        <Card className="max-w-xl min-w-0">
          <CardHeader>
            <CardTitle>Sign in to try the SDK demo</CardTitle>
            <CardDescription>
              Please sign in to try out the demo!
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <SignInButton mode="modal">
              <Button>Sign in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="outline">Create account</Button>
            </SignUpButton>
          </CardContent>
        </Card>
      </Show>

      <Show when="signed-in">
        <UploadDropzone
          upload={upload}
          input={{
            folder: "avatars",
            kind: "image",
          }}
          clickable
          className="text-fd-muted-foreground data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/10 data-[dragging=true]:text-foreground data-[dragging=true]:ring-primary/40 flex h-36 w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center transition-all duration-150 data-[can-upload=false]:cursor-not-allowed data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 data-[dragging=true]:border-solid data-[dragging=true]:shadow-md data-[dragging=true]:ring-2 data-[uploading=true]:pointer-events-none data-[uploading=true]:opacity-60"
        >
          {upload.isUploading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Uploading...
              <p className="text-fd-muted-foreground break-all text-sm">
                {upload.currentUploadingFile?.name} -{" "}
                {upload.progress.aggregatePercent}%
              </p>
            </>
          ) : (
            <>
              <UploadIcon />
              Drop files here (or click)
            </>
          )}

          {listError && <p className="text-sm text-red-500">{listError}</p>}
        </UploadDropzone>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-2">
              My files{" "}
              {myFilesQuery.isLoading && (
                <Loader2 className="size-4 animate-spin" />
              )}
            </CardTitle>
            <CardDescription>The files you have uploaded</CardDescription>
            <CardAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={myFilesQuery.isFetching}
                onClick={() => {
                  void myFilesQuery.refetch();
                }}
                title="Refresh file list"
              >
                {myFilesQuery.isFetching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
              </Button>
            </CardAction>
          </CardHeader>

          <CardContent>
            {myFilesQuery.isPending && files.length === 0 ? (
              <div className="text-fd-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Loading files...
              </div>
            ) : files.length > 0 ? (
              <ul className="space-y-2">
                {files.map((file) => (
                  <FileRow key={file.id} file={file} />
                ))}
              </ul>
            ) : (
              <p className="text-fd-muted-foreground text-sm">
                No files found for this user yet. Upload an image to get
                started.
              </p>
            )}
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
