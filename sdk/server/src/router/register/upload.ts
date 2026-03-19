import type { UploadCore } from "@silo-storage/sdk-core";

import type {
  CoreFileExpiryInput,
  FileRouter,
  InferMiddlewareData,
  SiloRouteOptionResolver,
  SiloRouteOptionResolverArgs,
  UploadFileInputWithAcceptedMimeTypes,
} from "../types";
import type {
  PrepareRouteUploadInput,
  PrepareRouteUploadResult,
  RegisterRouteUploadInput,
  RegisterRouteUploadResult,
} from "./types";
import { buildInternalCallbackMetadata } from "../../envelope";
import { enforceRouteConfigConstraints } from "../constraints";
import {
  normalizeFileExpiry,
  normalizeResolvedMimeTypesInput,
  normalizeRouteExpiryInput,
} from "../normalize";

function toRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function resolveRouteOption<TValue>(
  option: SiloRouteOptionResolver<TValue> | undefined,
  data: SiloRouteOptionResolverArgs<Record<string, unknown>, unknown>,
): Promise<TValue | undefined> {
  if (typeof option === "function") {
    const resolver = option as (
      data: Record<string, unknown>,
    ) => TValue | Promise<TValue>;
    return Promise.resolve(resolver(data));
  }
  return Promise.resolve(option);
}

export async function registerRouteUpload<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = Record<string, never>,
>(
  input: RegisterRouteUploadInput<TRouter, TRouteSlug, TRequest, TContext>,
): Promise<
  RegisterRouteUploadResult<InferMiddlewareData<TRouter[TRouteSlug]>>
> {
  const route = input.router[input.routeSlug];
  if (!route) {
    throw new Error(`Unknown route slug "${input.routeSlug}"`);
  }

  const resolvedContext = (input.context ?? {}) as TContext;

  const routeIsPublic = route.routeOptions?.isPublic;
  const files: UploadFileInputWithAcceptedMimeTypes[] = input.files.map(
    (file) => ({
      ...file,
      isPublic: typeof routeIsPublic === "boolean" ? routeIsPublic : undefined,
    }),
  );

  const derivedMimeTypesByFile = enforceRouteConfigConstraints(
    input.routeSlug,
    route.routeConfig,
    files,
  );

  const middlewareData = route.middleware
    ? toRecord(
        await route.middleware({
          req: input.req,
          context: resolvedContext,
          input: input.input,
          files,
          routeConfig: route.routeConfig,
          routeSlug: input.routeSlug,
        }),
        `Middleware for route "${input.routeSlug}" must return a plain object`,
      )
    : {};

  const callbackMetadata = buildInternalCallbackMetadata({
    routeSlug: input.routeSlug,
    middlewareData,
  });

  const routeOptionData: SiloRouteOptionResolverArgs<
    Record<string, unknown>,
    TContext
  > = {
    ...middlewareData,
    context: resolvedContext,
  };

  const resolvedIsPublic = await resolveRouteOption(
    route.routeOptions?.isPublic,
    routeOptionData,
  );

  if (typeof resolvedIsPublic === "boolean") {
    for (const file of files) {
      file.isPublic = resolvedIsPublic;
    }
  }

  const routeFileExpiry = await resolveRouteOption(
    route.routeOptions?.fileExpiry,
    routeOptionData,
  );

  const resolvedMimeTypesInput = await resolveRouteOption(
    route.routeOptions?.mimeTypes,
    routeOptionData,
  );
  const resolvedMimeTypes = normalizeResolvedMimeTypesInput(
    resolvedMimeTypesInput,
  );

  if (resolvedMimeTypes) {
    for (const file of files) {
      file.acceptedMimeTypes = resolvedMimeTypes;
    }
  } else {
    for (const [index, file] of files.entries()) {
      file.acceptedMimeTypes = derivedMimeTypesByFile[index];
    }
  }

  const resolvedFileExpiry = input.fileExpiry
    ? normalizeFileExpiry(input.fileExpiry)
    : routeFileExpiry !== undefined
      ? normalizeRouteExpiryInput(routeFileExpiry)
      : undefined;

  const registerUploadBatchWithExpiry = input.core.registerUploadBatch as (
    value: Parameters<UploadCore["registerUploadBatch"]>[0] & {
      fileExpiry?: CoreFileExpiryInput;
    },
  ) => ReturnType<UploadCore["registerUploadBatch"]>;

  const registerResult = await registerUploadBatchWithExpiry({
    files,
    callbackUrl: input.callbackUrl,
    callbackMetadata,
    requestMetadata: input.requestMetadata,
    fileExpiry: resolvedFileExpiry,
    dev: input.dev,
    expiresIn: input.expiresIn,
    protocol: input.protocol,
  });

  return {
    routeSlug: input.routeSlug,
    middlewareData: middlewareData as InferMiddlewareData<TRouter[TRouteSlug]>,
    callbackMetadata,
    registerResult,
  };
}

export async function prepareRouteUpload<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = Record<string, never>,
>(
  input: PrepareRouteUploadInput<TRouter, TRouteSlug, TRequest, TContext>,
): Promise<PrepareRouteUploadResult<InferMiddlewareData<TRouter[TRouteSlug]>>> {
  const registered = await registerRouteUpload({
    ...input,
    files: [input.file],
  });

  const firstFile = registered.registerResult.files[0];
  if (!firstFile) {
    throw new Error("registerRouteUpload did not return a file");
  }

  const prepareResult =
    registered.registerResult.mode === "development"
      ? {
          mode: "development" as const,
          file: firstFile,
          stream: registered.registerResult.stream,
          response: registered.registerResult.response,
        }
      : {
          mode: "production" as const,
          file: firstFile,
          registerResponse: registered.registerResult.registerResponse,
        };

  return {
    routeSlug: registered.routeSlug,
    middlewareData: registered.middlewareData,
    callbackMetadata: registered.callbackMetadata,
    prepareResult: prepareResult as Awaited<
      ReturnType<UploadCore["prepareUpload"]>
    >,
  };
}
