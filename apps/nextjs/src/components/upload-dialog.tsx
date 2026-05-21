"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, FileUp, Upload, X } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@silo-storage/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@silo-storage/ui/components/dialog";
import { Label } from "@silo-storage/ui/components/label";
import { Progress } from "@silo-storage/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silo-storage/ui/components/select";
import { cn } from "@silo-storage/ui/lib/utils";

interface Environment {
  id: string;
  name: string;
  type: string;
}

interface UploadDialogProps {
  projectId: string;
  environments: Environment[];
  defaultEnvironmentId?: string;
  onUploadComplete?: () => void;
  triggerClassName?: string;
}

type UploadStatus = "idle" | "preparing" | "uploading" | "success" | "error";

interface UploadState {
  status: UploadStatus;
  progress: number;
  error?: string;
  accessKey?: string;
}

export function UploadDialog({
  projectId,
  environments,
  defaultEnvironmentId,
  onUploadComplete,
  triggerClassName,
}: UploadDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedEnvId, setSelectedEnvId] = React.useState<string>("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadState, setUploadState] = React.useState<UploadState>({
    status: "idle",
    progress: 0,
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setSelectedFile(null);
        setSelectedEnvId(defaultEnvironmentId ?? "");
        setUploadState({ status: "idle", progress: 0 });
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [open, defaultEnvironmentId]);

  React.useEffect(() => {
    if (!open) return;
    if (!defaultEnvironmentId) return;
    setSelectedEnvId(defaultEnvironmentId);
  }, [defaultEnvironmentId, open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadState({ status: "idle", progress: 0 });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedEnvId) return;

    setUploadState({ status: "preparing", progress: 0 });

    try {
      const response = await fetch("/api/dashboard/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          environmentId: selectedEnvId,
          accessKey: createAccessKey(),
          fileName: selectedFile.name,
          size: selectedFile.size,
          mimeType: selectedFile.type || undefined,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message ?? "Failed to get upload URL");
      }

      const { uploadUrl, accessKey } = (await response.json()) as {
        uploadUrl: string;
        accessKey: string;
      };

      setUploadState({ status: "uploading", progress: 0 });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const createResponse = await fetch(uploadUrl, {
        method: "POST",
        signal: abortController.signal,
      });
      const createData = (await createResponse.json().catch(() => null)) as {
        uploadId?: string;
        error?: string;
      } | null;
      if (!createResponse.ok || !createData?.uploadId) {
        throw new Error(createData?.error ?? "Failed to create upload session");
      }

      const partUrl = new URL(uploadUrl);
      partUrl.pathname = `${partUrl.pathname.replace(/\/+$/, "")}/${encodeURIComponent(createData.uploadId)}`;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => {
          xhr.abort();
          reject(new Error("Upload aborted"));
        };

        abortController.signal.addEventListener("abort", abort, { once: true });
        xhr.open("PUT", partUrl.toString());
        xhr.setRequestHeader(
          "Content-Range",
          `bytes 0-${selectedFile.size - 1}/${selectedFile.size}`,
        );
        if (selectedFile.type) {
          xhr.setRequestHeader("Content-Type", selectedFile.type);
        }
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const percentage = Math.round((event.loaded / event.total) * 100);
          setUploadState((prev) => ({
            ...prev,
            progress: percentage,
          }));
        };
        xhr.onload = () => {
          abortController.signal.removeEventListener("abort", abort);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }
          reject(new Error(xhr.responseText || "Upload failed"));
        };
        xhr.onerror = () => {
          abortController.signal.removeEventListener("abort", abort);
          reject(new Error("Upload failed"));
        };
        xhr.send(selectedFile);
      });

      abortControllerRef.current = null;
      setUploadState({
        status: "success",
        progress: 100,
        accessKey,
      });
      onUploadComplete?.();
    } catch (error) {
      console.error("Upload error:", error);
      setUploadState({
        status: "error",
        progress: 0,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setUploadState({ status: "idle", progress: 0 });
  };

  const canUpload =
    selectedEnvId && selectedFile && uploadState.status === "idle";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn("w-full sm:w-auto", triggerClassName)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload File
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Select an environment and a file to upload.
          </DialogDescription>
        </DialogHeader>

        <div className="max-w-[400px] space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="environment">Environment</Label>
            <Select
              value={selectedEnvId}
              onValueChange={setSelectedEnvId}
              disabled={uploadState.status !== "idle"}
            >
              <SelectTrigger id="environment">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>File</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploadState.status !== "idle"}
            />
            {selectedFile ? (
              <div className="bg-muted flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border p-3">
                <FileUp className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {selectedFile.name}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  ({formatFileSize(selectedFile.size)})
                </span>
                {uploadState.status === "idle" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadState.status !== "idle"}
              >
                <FileUp className="mr-2 h-4 w-4" />
                Choose File
              </Button>
            )}
          </div>

          {(uploadState.status === "uploading" ||
            uploadState.status === "preparing") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {uploadState.status === "preparing"
                    ? "Preparing..."
                    : "Uploading..."}
                </span>
                <span>{uploadState.progress}%</span>
              </div>
              <Progress value={uploadState.progress} />
            </div>
          )}

          {uploadState.status === "success" && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Upload complete!</p>
                {uploadState.accessKey && (
                  <p className="text-xs opacity-80">
                    Access Key: {uploadState.accessKey.slice(0, 12)}...
                  </p>
                )}
              </div>
            </div>
          )}

          {uploadState.status === "error" && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Upload failed</p>
                <p className="text-xs opacity-80">{uploadState.error}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {uploadState.status === "uploading" ? (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          ) : uploadState.status === "success" ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!canUpload}>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function createAccessKey(): string {
  return nanoid(16);
}
