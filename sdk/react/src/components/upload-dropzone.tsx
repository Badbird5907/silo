import * as React from "react";

import type {
  AnyFileRouterLike,
  RouteInputBySlug,
  RouteSlug,
  UploadAccept,
  UseUploadOptions,
  UseUploadResult,
} from "../types";

interface UploadDropzoneBaseProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> {
  disabled?: boolean;
  /** When true, clicking the dropzone opens the system file picker (via `upload.beginUpload`). */
  clickable?: boolean;
  accept?: UploadAccept;
  input?: RouteInputBySlug<TRouter, TEndpoint>;
  awaitTimeoutMs?: number;
  concurrency?: number;
  className?: string;
  children?: React.ReactNode;
}

export interface UploadDropzoneWithHookProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> extends UploadDropzoneBaseProps<TRouter, TEndpoint>,
    UseUploadOptions<TRouter, TEndpoint> {
  upload?: never;
  useUpload: (
    options: UseUploadOptions<TRouter, TEndpoint>,
  ) => UseUploadResult<TRouter, TEndpoint>;
}

export interface UploadDropzoneWithExternalUploadProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> extends UploadDropzoneBaseProps<TRouter, TEndpoint> {
  upload: UseUploadResult<TRouter, TEndpoint>;
  endpoint?: never;
  onUploadBegin?: never;
  onUploadProgress?: never;
  onComplete?: never;
  onError?: never;
  onUploadAborted?: never;
  onFileDialogCancel?: never;
  useUpload: (
    options: UseUploadOptions<TRouter, TEndpoint>,
  ) => UseUploadResult<TRouter, TEndpoint>;
}

export type UploadDropzoneProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> =
  | UploadDropzoneWithHookProps<TRouter, TEndpoint>
  | UploadDropzoneWithExternalUploadProps<TRouter, TEndpoint>;

interface UploadDropzoneRootProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> extends UploadDropzoneBaseProps<TRouter, TEndpoint> {
  upload: UseUploadResult<TRouter, TEndpoint>;
}

function UploadDropzoneRoot<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(props: UploadDropzoneRootProps<TRouter, TEndpoint>) {
  const {
    upload,
    disabled,
    clickable,
    accept,
    input,
    awaitTimeoutMs,
    concurrency,
    className,
    children,
  } = props;
  const [isDragging, setIsDragging] = React.useState(false);

  const canUpload = !disabled && !upload.isUploading;

  return (
    <div
      className={className}
      onClick={
        clickable && canUpload
          ? () => {
              void upload.beginUpload({
                accept: accept ?? upload.accept,
                input,
                awaitTimeoutMs,
                concurrency,
              });
            }
          : undefined
      }
      onDragOver={(event) => {
        event.preventDefault();
        if (!canUpload) return;
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
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
      data-can-upload={canUpload ? "true" : "false"}
      data-clickable={clickable ? "true" : "false"}
    >
      {children ?? "Drop files here"}
    </div>
  );
}

function UploadDropzoneWithHook<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(props: UploadDropzoneWithHookProps<TRouter, TEndpoint>) {
  const {
    useUpload,
    endpoint,
    onUploadBegin,
    onUploadProgress,
    onComplete,
    onError,
    onUploadAborted,
    onFileDialogCancel,
    accept,
    disabled,
    clickable,
    input,
    awaitTimeoutMs,
    concurrency,
    className,
    children,
  } = props;
  const upload = useUpload({
    endpoint,
    accept,
    onUploadBegin,
    onUploadProgress,
    onComplete,
    onError,
    onUploadAborted,
    onFileDialogCancel,
  });

  return (
    <UploadDropzoneRoot
      upload={upload}
      disabled={disabled}
      clickable={clickable}
      accept={accept}
      input={input}
      awaitTimeoutMs={awaitTimeoutMs}
      concurrency={concurrency}
      className={className}
      children={children}
    />
  );
}

function hasExternalUpload<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(
  props: UploadDropzoneProps<TRouter, TEndpoint>,
): props is UploadDropzoneWithExternalUploadProps<TRouter, TEndpoint> {
  return "upload" in props && props.upload !== undefined;
}

export function UploadDropzone<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(props: UploadDropzoneProps<TRouter, TEndpoint>) {
  if (hasExternalUpload(props)) {
    const {
      upload,
      disabled,
      clickable,
      accept,
      input,
      awaitTimeoutMs,
      concurrency,
      className,
      children,
    } = props;

    return (
      <UploadDropzoneRoot
        upload={upload}
        disabled={disabled}
        clickable={clickable}
        accept={accept}
        input={input}
        awaitTimeoutMs={awaitTimeoutMs}
        concurrency={concurrency}
        className={className}
        children={children}
      />
    );
  }

  return <UploadDropzoneWithHook {...props} />;
}
