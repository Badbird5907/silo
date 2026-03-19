import * as React from "react";

import type {
  AnyFileRouterLike,
  RouteSlug,
  UseUploadOptions,
  UseUploadResult,
} from "../types";

export interface UploadButtonProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> extends UseUploadOptions<TRouter, TEndpoint> {
  multiple?: boolean;
  disabled?: boolean;
  input?: unknown;
  requestMetadata?: Record<string, unknown>;
  awaitTimeoutMs?: number;
  children?: React.ReactNode;
  useUpload: (
    options: UseUploadOptions<TRouter, TEndpoint>,
  ) => UseUploadResult<TRouter, TEndpoint>;
}

export function UploadButton<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(props: UploadButtonProps<TRouter, TEndpoint>) {
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
    multiple,
    input,
    requestMetadata,
    awaitTimeoutMs,
    children,
  } = props;
  const upload = useUpload({
    endpoint,
    onUploadBegin,
    onUploadProgress,
    onComplete,
    onError,
    onUploadAborted,
    onFileDialogCancel,
  });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isDisabled = disabled === true || upload.isUploading;
  const handleClick = () => inputRef.current?.click();

  return (
    <>
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple={multiple}
        accept={upload.accept}
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          if (selected.length === 0) return;
          void upload.uploadFiles(selected, {
            input,
            requestMetadata,
            awaitTimeoutMs,
          });
          event.currentTarget.value = "";
        }}
      />
      {React.isValidElement(children) ? (
        React.cloneElement(
          children as React.ReactElement<{
            disabled?: boolean;
            onClick?: React.MouseEventHandler;
          }>,
          {
            disabled:
              isDisabled ||
              (children.props as { disabled?: boolean }).disabled === true,
            onClick: (event: React.MouseEvent) => {
              (
                children.props as { onClick?: React.MouseEventHandler }
              ).onClick?.(event);
              if (!event.defaultPrevented) {
                handleClick();
              }
            },
          },
        )
      ) : (
        <button type="button" disabled={isDisabled} onClick={handleClick}>
          {children ?? "Upload"}
        </button>
      )}
    </>
  );
}
