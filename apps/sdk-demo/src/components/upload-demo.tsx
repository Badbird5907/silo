import type { ListFilesResult, SiloFileSummary } from "@silo-storage/sdk-core";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCcw, Upload } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useUpload } from "@/lib/upload";
import { Show, SignInButton, useAuth } from "@clerk/nextjs";

interface MyFilesApiResponse {
  data: ListFilesResult;
}

async function fetchMyFiles(): Promise<SiloFileSummary[]> {
  const response = await fetch("/api/upload/my-files?page=1&pageSize=25", {
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
        : "text-amber-600";

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{file.fileName}</p>
          <p className="text-muted-foreground text-xs">
            {file.mimeType ?? "unknown"} - {formatBytes(file.size)}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium ${statusColor}`}>
          {file.status}
        </span>
      </div>

      <div className="text-muted-foreground mt-2 space-y-1 text-xs">
        <p>Uploaded: {formatDate(file.uploadCompletedAt ?? file.createdAt)}</p>
        <p>Expires: {file.expiresAt ? formatDate(file.expiresAt) : "Never"}</p>
        <p className="truncate">fileKeyId: {file.id}</p>
      </div>
    </li>
  );
}

export function UploadDemo() {
  const { userId, isLoaded } = useAuth();

  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const myFilesQuery = useQuery({
    queryKey: ["my-files", userId],
    queryFn: fetchMyFiles,
    enabled: Boolean(isLoaded && userId),
  });
  const files = myFilesQuery.data ?? [];
  const listError =
    uploadError ??
    (myFilesQuery.error instanceof Error
      ? myFilesQuery.error.message
      : null);

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
    <div className="flex flex-col gap-4">

      <Show when="signed-out">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Upload demo requires sign-in</CardTitle>
            <CardDescription>
              Sign in to try the demo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignInButton mode="modal">
              <Button>Sign in to continue</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </Show>
      <Show when="signed-in">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Image uploader</CardTitle>
              <CardDescription>
                Upload some files here (demo)
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={myFilesQuery.isFetching}
                onClick={() => {
                  setUploadError(null);
                  void myFilesQuery.refetch();
                }}
              >
                {myFilesQuery.isFetching ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-1 size-4" />
                )}
                Refresh
              </Button>

              <Button
                disabled={upload.isUploading || !userId}
                onClick={() => {
                  if (!userId) return;
                  void upload.beginUpload();
                }}
              >
                {upload.isUploading ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-1 size-4" />
                )}
                {upload.isUploading ? "Uploading..." : "Upload images"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {upload.isUploading ? (
              <div>
                <p className="text-muted-foreground mb-2 text-sm">
                  Upload progress:{" "}
                  {Math.round(upload.progress.aggregatePercent)}%
                </p>
                <Progress value={upload.progress.aggregatePercent} />
              </div>
            ) : null}

            {listError ? (
              <p className="text-sm text-red-500">{listError}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-h-0 flex-1">
          <CardHeader>
            <CardTitle>My files</CardTitle>
            <CardDescription>
              Here are the files you have uploaded that are currently active.
            </CardDescription>
          </CardHeader>

          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            {myFilesQuery.isPending && files.length === 0 ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading files...
              </div>
            ) : files.length > 0 ? (
              <ul className="space-y-2">
                {files.map((file) => (
                  <FileRow key={file.id} file={file} />
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No files found for this user yet. Upload an image to get
                started.
              </p>
            )}
          </CardContent>
        </Card>
      </Show>
    </div>
  )
} 