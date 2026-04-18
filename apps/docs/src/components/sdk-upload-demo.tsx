"use client";

import type { ListFilesResult, SiloFileSummary } from "@silo-storage/sdk-core";
import * as React from "react";
import { Show, SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCcw, Upload } from "lucide-react";

import { useUpload } from "@/lib/sdk-demo/upload";
import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";
import { Progress } from "@silo-storage/ui/components/progress";

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

  const listResult = payload && "data" in payload ? payload.data : { files: [] };
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

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
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

      <div className="mt-2 space-y-1 text-xs text-fd-muted-foreground">
        <p>Uploaded: {formatDate(file.uploadCompletedAt ?? file.createdAt)}</p>
        <p>Expires: {file.expiresAt ? formatDate(file.expiresAt) : "Never"}</p>
        <p className="truncate">fileKeyId: {file.id}</p>
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
    onComplete: () => {
      setUploadError(null);
      void myFilesQuery.refetch();
    },
    onError: (error) => {
      setUploadError(error.message);
    },
  });

  return (
    <div className="grid gap-6">
      <Show when="signed-out">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Sign in to try the SDK demo</CardTitle>
            <CardDescription>
              Upload a couple of test images and view the files tied to your account.
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>SDK demo</CardTitle>
              <CardDescription>
                Upload files and inspect the records associated with your user.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <UserButton />
              <Button
                variant="outline"
                disabled={myFilesQuery.isFetching}
                onClick={() => {
                  setUploadError(null);
                  void myFilesQuery.refetch();
                }}
              >
                {myFilesQuery.isFetching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                Refresh
              </Button>

              <Button
                disabled={upload.isUploading || !userId}
                onClick={() => {
                  if (!userId) return;
                  void upload.beginUpload({ awaitTimeoutMs: 60_000 });
                }}
              >
                {upload.isUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {upload.isUploading ? "Uploading..." : "Upload images"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {upload.isUploading ? (
              <div className="space-y-2">
                <p className="text-sm text-fd-muted-foreground">
                  Upload progress: {Math.round(upload.progress.aggregatePercent)}%
                </p>
                {upload.currentUploadingFile ? (
                  <p className="text-sm text-fd-muted-foreground">
                    Uploading: {upload.currentUploadingFile.name} (
                    {formatBytes(upload.currentUploadingFile.size)})
                  </p>
                ) : null}
                <Progress value={upload.progress.aggregatePercent} />
              </div>
            ) : null}

            {listError ? <p className="text-sm text-red-500">{listError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My files</CardTitle>
            <CardDescription>
              Uploaded files for the signed-in demo user, including deleted records.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {myFilesQuery.isPending && files.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
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
              <p className="text-sm text-fd-muted-foreground">
                No files found for this user yet. Upload an image to get started.
              </p>
            )}
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
