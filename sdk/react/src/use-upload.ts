import * as React from "react";

import type {
  AnyFileRouterLike,
  OpenFilePickerOptions,
  RouterConfigLike,
  RouteSlug,
  UploadCompletion,
  UploadRequestOptions,
  UseStagedUploadOptions,
  UseStagedUploadResult,
  UseUploadOptions,
  UseUploadResult,
} from "./types";
import {
  buildAcceptAttribute,
  getRouteMaxFileCount,
  getRouteFileTypeKeys,
  isFileAllowedByRouteFileTypes,
  routeAllowsMultipleFiles,
} from "./file-types";
import {
  awaitCompletion,
  fetchRouterConfig,
  registerUpload,
  uploadFileWithProgress,
} from "./transport";
import { SiloUploadError } from "./types";

interface UseUploadFactoryContext {
  endpointUrl: string;
  fetchImpl: typeof fetch;
  initialRouterConfig?: RouterConfigLike;
}

function openFilePickerDialog(
  options: OpenFilePickerOptions & {
    onCancel?: () => void;
  },
): Promise<File[]> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new SiloUploadError({
      code: "FILE_PICKER_UNAVAILABLE",
      message: "File picker is only available in browser environments",
    });
  }

  return new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    input.multiple = options.multiple ?? false;
    input.accept = options.accept ?? "";
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      input.remove();
    };

    const settle = (files: File[], canceled: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (canceled) {
        options.onCancel?.();
      }
      resolve(files);
    };

    const scheduleCancelCheck = () => {
      window.setTimeout(() => {
        if (settled) return;
        const selected = Array.from(input.files ?? []);
        if (selected.length > 0) return;
        settle([], true);
      }, 300);
    };

    const handleWindowFocus = () => {
      scheduleCancelCheck();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      scheduleCancelCheck();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    input.onchange = () => {
      const selected = Array.from(input.files ?? []);
      settle(selected, selected.length === 0);
    };

    input.click();
  });
}

export function useUploadInternal<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(
  factoryContext: UseUploadFactoryContext,
  endpointConfigContext: React.Context<RouterConfigLike | null>,
  options: UseUploadOptions<TRouter, TEndpoint>,
): UseUploadResult<TRouter, TEndpoint> {
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<SiloUploadError | null>(null);
  const [result, setResult] = React.useState<
    UploadCompletion<TRouter, TEndpoint>[] | null
  >(null);
  const [progressByFile, setProgressByFile] = React.useState<
    Record<string, number>
  >({});
  const abortRef = React.useRef<AbortController | null>(null);

  const contextRouterConfig = React.useContext(endpointConfigContext);
  const effectiveRouterConfig =
    contextRouterConfig ?? factoryContext.initialRouterConfig;
  const routeFileTypeKeys = React.useMemo(
    () => getRouteFileTypeKeys(effectiveRouterConfig, options.endpoint),
    [effectiveRouterConfig, options.endpoint],
  );
  const accept = React.useMemo(
    () => buildAcceptAttribute(routeFileTypeKeys),
    [routeFileTypeKeys],
  );
  const supportsMultipleByRoute = React.useMemo(
    () => routeAllowsMultipleFiles(effectiveRouterConfig, options.endpoint),
    [effectiveRouterConfig, options.endpoint],
  );
  const maxFileCountByRoute = React.useMemo(
    () => getRouteMaxFileCount(effectiveRouterConfig, options.endpoint),
    [effectiveRouterConfig, options.endpoint],
  );

  React.useEffect(() => {
    if (effectiveRouterConfig?.[options.endpoint]) return;
    void fetchRouterConfig(
      factoryContext.endpointUrl,
      factoryContext.fetchImpl,
    ).catch(() => {
      // Best-effort warmup. upload path still works without this.
    });
  }, [
    effectiveRouterConfig,
    factoryContext.endpointUrl,
    factoryContext.fetchImpl,
    options.endpoint,
  ]);

  const reset = React.useCallback(() => {
    setError(null);
    setResult(null);
    setProgressByFile({});
    setIsUploading(false);
  }, []);

  const abort = React.useCallback(() => {
    abortRef.current?.abort();
    options.onUploadAborted?.();
  }, [options]);

  const uploadFiles = React.useCallback<
    UseUploadResult<TRouter, TEndpoint>["uploadFiles"]
  >(
    async (files, uploadOptions) => {
      if (files.length === 0) return [];
      const abortController = new AbortController();
      abortRef.current = abortController;
      setIsUploading(true);
      setError(null);
      setResult(null);
      setProgressByFile({});

      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      let aggregateLoaded = 0;
      const loadedByIndex = new Map<number, number>();

      try {
        const firstDisallowed = files.find(
          (file) => !isFileAllowedByRouteFileTypes(file, routeFileTypeKeys),
        );
        if (firstDisallowed) {
          throw new SiloUploadError({
            code: "FILE_TYPE_NOT_ALLOWED",
            message: `File type not allowed for route "${options.endpoint}": "${firstDisallowed.name}"`,
          });
        }
        if (
          maxFileCountByRoute !== undefined &&
          files.length > maxFileCountByRoute
        ) {
          throw new SiloUploadError({
            code: "TOO_MANY_FILES",
            message: `Route "${options.endpoint}" allows at most ${maxFileCountByRoute} file(s).`,
          });
        }

        files.forEach((file, index) => options.onUploadBegin?.(file, index));

        const registrations = await registerUpload(
          factoryContext.endpointUrl,
          factoryContext.fetchImpl,
          {
            endpoint: options.endpoint,
            input: uploadOptions?.input,
            requestMetadata: uploadOptions?.requestMetadata,
            expiresIn: uploadOptions?.expiresIn,
            protocol: uploadOptions?.protocol,
            files: files.map((file) => ({
              fileName: file.name,
              size: file.size,
              mimeType: file.type || undefined,
            })),
          },
        );

        const completions: UploadCompletion<TRouter, TEndpoint>[] = [];
        for (const [index, file] of files.entries()) {
          const registration = registrations[index];
          if (!registration) {
            throw new SiloUploadError({
              code: "REGISTER_RESPONSE_INVALID",
              message: `Missing registration for file "${file.name}"`,
            });
          }

          await uploadFileWithProgress(
            registration.uploadUrl,
            file,
            (loaded, total) => {
              const previousLoaded = loadedByIndex.get(index) ?? 0;
              loadedByIndex.set(index, loaded);
              aggregateLoaded += loaded - previousLoaded;

              const percent = Math.round(
                total > 0 ? (loaded / total) * 100 : 0,
              );
              const aggregatePercent = Math.round(
                totalBytes > 0 ? (aggregateLoaded / totalBytes) * 100 : 0,
              );

              setProgressByFile((prev) => ({
                ...prev,
                [registration.fileKeyId]: percent,
              }));

              options.onUploadProgress?.({
                file,
                fileIndex: index,
                loaded,
                total,
                percent,
                aggregateLoaded,
                aggregateTotal: totalBytes,
                aggregatePercent,
              });
            },
            abortController.signal,
          );

          const completion = await awaitCompletion(
            factoryContext.endpointUrl,
            factoryContext.fetchImpl,
            registration.fileKeyId,
            uploadOptions?.awaitTimeoutMs,
          );

          completions.push({
            fileKeyId: completion.fileKeyId,
            routeSlug: completion.routeSlug as TEndpoint,
            accessKey: String(registration.accessKey),
            uploadUrl: String(registration.uploadUrl),
            result: completion.onUploadCompleteResult as UploadCompletion<
              TRouter,
              TEndpoint
            >["result"],
          });
        }

        setResult(completions);
        options.onComplete?.(completions);
        setIsUploading(false);
        return completions;
      } catch (cause) {
        const normalized =
          cause instanceof SiloUploadError
            ? cause
            : new SiloUploadError({
                code: "UPLOAD_FAILED",
                message:
                  cause instanceof Error ? cause.message : "Upload failed",
                cause,
              });
        setError(normalized);
        options.onError?.(normalized);
        setIsUploading(false);
        throw normalized;
      } finally {
        abortRef.current = null;
      }
    },
    [factoryContext, maxFileCountByRoute, options, routeFileTypeKeys],
  );

  const uploadFile = React.useCallback<
    UseUploadResult<TRouter, TEndpoint>["uploadFile"]
  >(
    async (file, uploadOptions) => {
      const [completion] = await uploadFiles([file], uploadOptions);
      if (!completion) {
        throw new SiloUploadError({
          code: "UPLOAD_FAILED",
          message: "File upload did not produce a completion result",
        });
      }
      return completion;
    },
    [uploadFiles],
  );

  const beginUpload = React.useCallback<
    UseUploadResult<TRouter, TEndpoint>["beginUpload"]
  >(
    async (beginOptions) => {
      try {
        const selected = await openFilePickerDialog({
          multiple: beginOptions?.multiple ?? supportsMultipleByRoute ?? false,
          accept: beginOptions?.accept ?? accept,
          onCancel: options.onFileDialogCancel,
        });

        if (selected.length === 0) {
          return [];
        }
        if (
          maxFileCountByRoute !== undefined &&
          selected.length > maxFileCountByRoute
        ) {
          throw new SiloUploadError({
            code: "TOO_MANY_FILES",
            message: `Route "${options.endpoint}" allows at most ${maxFileCountByRoute} file(s).`,
          });
        }

        return uploadFiles(selected, {
          input: beginOptions?.input,
          requestMetadata: beginOptions?.requestMetadata,
          expiresIn: beginOptions?.expiresIn,
          protocol: beginOptions?.protocol,
          awaitTimeoutMs: beginOptions?.awaitTimeoutMs,
        });
      } catch (cause) {
        const normalized =
          cause instanceof SiloUploadError
            ? cause
            : new SiloUploadError({
                code: "FILE_PICKER_UNAVAILABLE",
                message:
                  cause instanceof Error
                    ? cause.message
                    : "File picker is unavailable",
                cause,
              });
        setError(normalized);
        options.onError?.(normalized);
        throw normalized;
      }
    },
    [accept, maxFileCountByRoute, options, supportsMultipleByRoute, uploadFiles],
  );

  const aggregateLoaded = Object.values(progressByFile).reduce(
    (sum, value) => sum + value,
    0,
  );
  const aggregateCount = Math.max(1, Object.keys(progressByFile).length);

  return {
    isIdle: !isUploading,
    isUploading,
    progress: {
      aggregatePercent: Math.round(aggregateLoaded / aggregateCount),
      aggregateLoaded: 0,
      aggregateTotal: 0,
      byFile: progressByFile,
    },
    error,
    result,
    accept,
    uploadFiles,
    uploadFile,
    beginUpload,
    abort,
    reset,
  };
}

export function useStagedUploadInternal<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>(
  factoryContext: UseUploadFactoryContext,
  endpointConfigContext: React.Context<RouterConfigLike | null>,
  options: UseStagedUploadOptions<TRouter, TEndpoint>,
): UseStagedUploadResult<TRouter, TEndpoint> {
  const upload = useUploadInternal(
    factoryContext,
    endpointConfigContext,
    options,
  );
  const [files, setFiles] = React.useState<File[]>([]);

  const contextRouterConfig = React.useContext(endpointConfigContext);
  const effectiveRouterConfig =
    contextRouterConfig ?? factoryContext.initialRouterConfig;
  const supportsMultipleByRoute = React.useMemo(
    () => routeAllowsMultipleFiles(effectiveRouterConfig, options.endpoint),
    [effectiveRouterConfig, options.endpoint],
  );
  const maxFileCountByRoute = React.useMemo(
    () => getRouteMaxFileCount(effectiveRouterConfig, options.endpoint),
    [effectiveRouterConfig, options.endpoint],
  );

  const openFilePicker = React.useCallback<
    UseStagedUploadResult<TRouter, TEndpoint>["openFilePicker"]
  >(
    async (pickerOptions) => {
      try {
        const shouldAllowMultiple =
          pickerOptions?.multiple ??
          options.multiple ??
          supportsMultipleByRoute ??
          false;
        const selected = await openFilePickerDialog({
          multiple: shouldAllowMultiple,
          accept: pickerOptions?.accept ?? options.accept ?? upload.accept,
          onCancel: options.onFileDialogCancel,
        });

        if (selected.length === 0) {
          return [];
        }

        setFiles((previous) => {
          if (maxFileCountByRoute !== undefined) {
            const remainingSlots = Math.max(
              0,
              maxFileCountByRoute - previous.length,
            );
            if (remainingSlots === 0) {
              options.onError?.(
                new SiloUploadError({
                  code: "TOO_MANY_FILES",
                  message: `Route "${options.endpoint}" allows at most ${maxFileCountByRoute} file(s).`,
                }),
              );
              return previous;
            }
            const limitedSelection = selected.slice(0, remainingSlots);
            return shouldAllowMultiple
              ? [...previous, ...limitedSelection]
              : limitedSelection.slice(0, 1);
          }

          if (!shouldAllowMultiple) {
            return selected.slice(0, 1);
          }
          return [...previous, ...selected];
        });

        return selected;
      } catch (cause) {
        const normalized =
          cause instanceof SiloUploadError
            ? cause
            : new SiloUploadError({
                code: "FILE_PICKER_UNAVAILABLE",
                message:
                  cause instanceof Error
                    ? cause.message
                    : "File picker is unavailable",
                cause,
              });
        options.onError?.(normalized);
        throw normalized;
      }
    },
    [maxFileCountByRoute, options, supportsMultipleByRoute, upload.accept],
  );

  const removeFile = React.useCallback<
    UseStagedUploadResult<TRouter, TEndpoint>["removeFile"]
  >((fileOrIndex) => {
    setFiles((previous) => {
      if (typeof fileOrIndex === "number") {
        return previous.filter((_, index) => index !== fileOrIndex);
      }
      return previous.filter((file) => file !== fileOrIndex);
    });
  }, []);

  const clearFiles = React.useCallback(() => {
    setFiles([]);
  }, []);

  const uploadStaged = React.useCallback<
    UseStagedUploadResult<TRouter, TEndpoint>["upload"]
  >(
    async (requestOptions) => {
      if (files.length === 0) {
        return [];
      }

      const mergedOptions: UploadRequestOptions = {
        input: requestOptions?.input ?? options.input,
        requestMetadata:
          requestOptions?.requestMetadata ?? options.requestMetadata,
        expiresIn: requestOptions?.expiresIn ?? options.expiresIn,
        protocol: requestOptions?.protocol ?? options.protocol,
        awaitTimeoutMs:
          requestOptions?.awaitTimeoutMs ?? options.awaitTimeoutMs,
      };

      const completions = await upload.uploadFiles(files, mergedOptions);
      if (options.clearOnUploadComplete) {
        setFiles([]);
      }
      return completions;
    },
    [files, options, upload],
  );

  const reset = React.useCallback(() => {
    setFiles([]);
    upload.reset();
  }, [upload]);

  return {
    files,
    isUploading: upload.isUploading,
    uploadProgress: upload.progress.aggregatePercent,
    error: upload.error,
    result: upload.result,
    accept: upload.accept,
    openFilePicker,
    removeFile,
    clearFiles,
    upload: uploadStaged,
    abort: upload.abort,
    reset,
  };
}
