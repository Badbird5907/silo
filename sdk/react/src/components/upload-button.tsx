import * as React from "react";

import type {
  AnyFileRouterLike,
  RouteInputBySlug,
  RouteSlug,
  UseUploadOptions,
  UseUploadResult,
} from "../types";

interface UploadButtonBaseProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> {
  multiple?: boolean;
  disabled?: boolean;
  input?: RouteInputBySlug<TRouter, TEndpoint>;
  awaitTimeoutMs?: number;
  concurrency?: number;
  children?: React.ReactNode;
}

export interface UploadButtonWithHookProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> extends UploadButtonBaseProps<TRouter, TEndpoint>,
    UseUploadOptions<TRouter, TEndpoint> {
  upload?: never;
  useUpload: (
    options: UseUploadOptions<TRouter, TEndpoint>,
  ) => UseUploadResult<TRouter, TEndpoint>;
}

export interface UploadButtonWithExternalUploadProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> extends UploadButtonBaseProps<TRouter, TEndpoint> {
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

export type UploadButtonProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> =
  | UploadButtonWithHookProps<TRouter, TEndpoint>
  | UploadButtonWithExternalUploadProps<TRouter, TEndpoint>;

interface UploadButtonRootProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> extends UploadButtonBaseProps<TRouter, TEndpoint> {
  upload: UseUploadResult<TRouter, TEndpoint>;
}

function UploadButtonRoot<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(props: UploadButtonRootProps<TRouter, TEndpoint>) {
  const {
    upload,
    multiple,
    disabled,
    input,
    awaitTimeoutMs,
    concurrency,
    children,
  } = props;
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
            awaitTimeoutMs,
            concurrency,
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

function UploadButtonWithHook<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(props: UploadButtonWithHookProps<TRouter, TEndpoint>) {
  const {
    useUpload,
    endpoint,
    onUploadBegin,
    onUploadProgress,
    onComplete,
    onError,
    onUploadAborted,
    onFileDialogCancel,
    multiple,
    disabled,
    input,
    awaitTimeoutMs,
    concurrency,
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

  return (
    <UploadButtonRoot
      upload={upload}
      multiple={multiple}
      disabled={disabled}
      input={input}
      awaitTimeoutMs={awaitTimeoutMs}
      concurrency={concurrency}
      children={children}
    />
  );
}

function hasExternalUpload<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(
  props: UploadButtonProps<TRouter, TEndpoint>,
): props is UploadButtonWithExternalUploadProps<TRouter, TEndpoint> {
  return "upload" in props && props.upload !== undefined;
}

export function UploadButton<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(props: UploadButtonProps<TRouter, TEndpoint>) {
  if (hasExternalUpload(props)) {
    const {
      upload,
      multiple,
      disabled,
      input,
      awaitTimeoutMs,
      concurrency,
      children,
    } = props;

    return (
      <UploadButtonRoot
        upload={upload}
        multiple={multiple}
        disabled={disabled}
        input={input}
        awaitTimeoutMs={awaitTimeoutMs}
        concurrency={concurrency}
        children={children}
      />
    );
  }

  return <UploadButtonWithHook {...props} />;
}
