import * as React from "react";

import type {
  AnyFileRouterLike,
  RouteSlug,
  UseUploadOptions,
  UseUploadResult,
} from "../types";

export interface UploadDropzoneProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> extends UseUploadOptions<TRouter, TEndpoint> {
  upload?: UseUploadResult<TRouter, TEndpoint>;
  disabled?: boolean;
  input?: unknown;
  awaitTimeoutMs?: number;
  concurrency?: number;
  className?: string;
  children?: React.ReactNode;
  useUpload: (
    options: UseUploadOptions<TRouter, TEndpoint>,
  ) => UseUploadResult<TRouter, TEndpoint>;
}

export function UploadDropzone<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(props: UploadDropzoneProps<TRouter, TEndpoint>) {
  const {
    useUpload,
    endpoint,
    onUploadBegin,
    onUploadProgress,
    onComplete,
    onError,
    onUploadAborted,
    onFileDialogCancel,
    disabled,
    input,
    awaitTimeoutMs,
    concurrency,
    className,
    children,
  } = props;
  const uploadInternal = useUpload({
    endpoint,
    onUploadBegin,
    onUploadProgress,
    onComplete,
    onError,
    onUploadAborted,
    onFileDialogCancel,
  });
  const [isDragging, setIsDragging] = React.useState(false);
  const upload = props.upload ?? uploadInternal;

  const canUpload = !disabled && !upload.isUploading;

  return (
    <div
      className={className}
      onDragOver={(event) => {
        event.preventDefault();
        if (!canUpload) return;
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!canUpload) return;
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length === 0) return;
        void upload.uploadFiles(dropped, {
          input,
          awaitTimeoutMs,
          concurrency,
        });
      }}
      data-dragging={isDragging ? "true" : "false"}
      data-uploading={upload.isUploading ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
    >
      {children ?? "Drop files here"}
    </div>
  );
}
