import * as React from "react";

import type {
  AnyFileRouterLike,
  RouteInputBySlug,
  RouteSlug,
  UploadAccept,
  UseUploadOptions,
  UseUploadResult,
} from "../types";
import {
  resolveAcceptValue,
  resolveStaticAcceptValue,
} from "../accepts";

interface UploadButtonBaseProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> {
  multiple?: boolean;
  disabled?: boolean;
  accept?: UploadAccept;
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
    accept,
    input,
    awaitTimeoutMs,
    concurrency,
    children,
  } = props;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isDisabled = disabled === true || upload.isUploading;
  const pickerAccept = accept ?? upload.accept;
  const staticAccept =
    resolveStaticAcceptValue(pickerAccept) ?? "";
  const handleClick = React.useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    void (async () => {
      input.accept = (await resolveAcceptValue(pickerAccept)) ?? "";
      input.click();
    })();
  }, [pickerAccept]);

  return (
    <>
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple={multiple}
        accept={staticAccept}
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
    accept,
    multiple,
    disabled,
    input,
    awaitTimeoutMs,
    concurrency,
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
    <UploadButtonRoot
      upload={upload}
      multiple={multiple}
      disabled={disabled}
      accept={accept}
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
      accept,
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
        accept={accept}
        input={input}
        awaitTimeoutMs={awaitTimeoutMs}
        concurrency={concurrency}
        children={children}
      />
    );
  }

  return <UploadButtonWithHook {...props} />;
}
