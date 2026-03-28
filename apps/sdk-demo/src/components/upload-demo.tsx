"use client";

import * as React from "react";

import { useUpload } from "@/lib/upload";

interface UploadedItem {
  fileKeyId: string;
  accessKey: string;
  uploadUrl: string;
  fileName: string;
  uploadedBy: string;
  mimeType: string;
  size: number;
}

export function UploadDemo() {
  const [uploaded, setUploaded] = React.useState<UploadedItem[]>([]);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [loadingDownloadFor, setLoadingDownloadFor] = React.useState<
    string | null
  >(null);

  const upload = useUpload({
    endpoint: "imageOrVideoUploader",
    onComplete: (completions) => {
      setLastError(null);
      setUploaded(
        completions.map((completion) => ({
          fileKeyId: completion.fileKeyId,
          accessKey: completion.result.accessKey,
          uploadUrl: completion.uploadUrl ?? "",
          fileName: completion.result.fileName,
          uploadedBy: completion.result.uploadedBy,
          mimeType: completion.result.mimeType,
          size: completion.result.size,
        })),
      );
    },
    onError: (error) => {
      setLastError(error.message);
    },
  });

  async function handleDownload(item: UploadedItem) {
    try {
      setLoadingDownloadFor(item.fileKeyId);
      setLastError(null);
      if (!item.uploadUrl) {
        throw new Error("Missing upload URL for this file");
      }
      // const response = await fetch("/api/upload/download", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     accessKey: item.accessKey,
      //     uploadUrl: item.uploadUrl,
      //     fileName: item.fileName,
      //   }),
      // });
      // const data = (await response.json().catch(() => null)) as
      //   | { url?: string; error?: string }
      //   | null;
      // if (!response.ok || !data?.url) {
      //   throw new Error(data?.error ?? "Failed to create download URL");
      // }

      // window.open(data.url, "_blank", "noopener,noreferrer");
      const url = `http://silo-test.lvh.me:8787/f/${item.accessKey}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setLastError(
        error instanceof Error ? error.message : "Failed to download file",
      );
    } finally {
      setLoadingDownloadFor(null);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm"
        disabled={upload.isUploading}
        onClick={() => {
          void upload.beginUpload({
            multiple: true,
            accept: "image/*",
          });
        }}
      >
        {upload.isUploading ? "Uploading..." : "Choose image(s)"}
      </button>

      {upload.isUploading ? (
        <p className="text-muted-foreground text-sm">
          Upload progress: {Math.round(upload.progress.aggregatePercent)}%
        </p>
      ) : null}

      {lastError ? (
        <p className="text-sm text-red-500">Error: {lastError}</p>
      ) : null}

      {uploaded.length > 0 ? (
        <ul className="space-y-3 text-sm">
          {uploaded.map((item) => (
            <li key={item.fileKeyId} className="rounded-md border p-3">
              <p className="text-foreground">
                {item.fileName} ({Math.max(1, Math.round(item.size / 1024))} KB)
              </p>
              <p className="text-muted-foreground">
                {item.mimeType} - uploaded by {item.uploadedBy}
              </p>
              <p className="text-muted-foreground text-xs">{item.fileKeyId}</p>
              <button
                type="button"
                className="mt-2 inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs"
                disabled={loadingDownloadFor === item.fileKeyId}
                onClick={() => {
                  void handleDownload(item);
                }}
              >
                {loadingDownloadFor === item.fileKeyId
                  ? "Preparing..."
                  : "Download"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
