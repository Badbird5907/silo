import type { UploadCore } from "@silo-storage/sdk-core";

import type {
  CoreFileExpiryInput,
  FileRouter,
  InferMiddlewareData,
  RouteInputBySlug,
  SiloRouteConfigInput,
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
import { parseRouteInput } from "../input-schema";
import { normalizeRouteConfigInput, normalizeRouteExpiryInput } from "../normalize";

const defaultRouteConfigInput = ["blob"] as const;

function toRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function resolveRouteOption<
  TValue,
  TMiddlewareData extends Record<string, unknown>,
  TContext,
  TInput,
>(
  option:
    | SiloRouteOptionResolver<TValue, TMiddlewareData, TContext, TInput>
    | undefined,
  data: SiloRouteOptionResolverArgs<TMiddlewareData, TContext, TInput>,
): Promise<TValue | undefined> {
  if (typeof option === "function") {
    const resolver = option as (
      data: SiloRouteOptionResolverArgs<TMiddlewareData, TContext, TInput>,
    ) => TValue | Promise<TValue>;
    return Promise.resolve(resolver(data));
  }
  return Promise.resolve(option);
}

async function resolveRouteConfigInput<
  TMiddlewareData extends Record<string, unknown>,
  TContext,
  TInput,
>(
  expects:
    | SiloRouteConfigInput
    | ((
        data: SiloRouteOptionResolverArgs<TMiddlewareData, TContext, TInput>,
      ) => Promise<SiloRouteConfigInput> | SiloRouteConfigInput)
    | undefined,
  data: SiloRouteOptionResolverArgs<TMiddlewareData, TContext, TInput>,
): Promise<SiloRouteConfigInput> {
  if (!expects) {
    return defaultRouteConfigInput;
  }

  if (typeof expects === "function") {
    return expects(data);
  }

  return expects;
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
  const parsedInput = await parseRouteInput<RouteInputBySlug<TRouter, TRouteSlug>>(
    {
      routeSlug: input.routeSlug,
      schema: route.inputSchema as never,
      rawInput: input.input,
    },
  );

  const routeIsPublic = route.routeOptions?.isPublic;
  const files: UploadFileInputWithAcceptedMimeTypes[] = input.files.map(
    (file) => ({
      ...file,
      isPublic: typeof routeIsPublic === "boolean" ? routeIsPublic : undefined,
    }),
  );

  const middlewareData = route.middleware
    ? toRecord(
        await route.middleware({
          req: input.req,
          context: resolvedContext,
          input: parsedInput,
          files,
          routeSlug: input.routeSlug,
        }),
        `Middleware for route "${input.routeSlug}" must return a plain object`,
      )
    : {};

  for (const file of files) {
    file.metadata = { ...middlewareData };
  }

  const callbackMetadata = buildInternalCallbackMetadata({
    routeSlug: input.routeSlug,
  });

  const routeOptionData: SiloRouteOptionResolverArgs<
    Record<string, unknown>,
    TContext,
    RouteInputBySlug<TRouter, TRouteSlug>
  > = {
    ...middlewareData,
    context: resolvedContext,
    input: parsedInput,
  };

  const routeConfigInput = await resolveRouteConfigInput(
    route.expects as
      | SiloRouteConfigInput
      | ((
          data: SiloRouteOptionResolverArgs<
            Record<string, unknown>,
            TContext,
            RouteInputBySlug<TRouter, TRouteSlug>
          >,
        ) => Promise<SiloRouteConfigInput> | SiloRouteConfigInput)
      | undefined,
    routeOptionData,
  );
  const routeConfig = normalizeRouteConfigInput(routeConfigInput);
  const derivedAcceptedMimeTypesByFile = enforceRouteConfigConstraints(
    input.routeSlug,
    routeConfig,
    files,
  );

  const resolvedIsPublic = await resolveRouteOption(
    route.routeOptions?.isPublic,
    routeOptionData,
  );
  const resolvedServeImage = await resolveRouteOption(
    route.routeOptions?.serveImage,
    routeOptionData,
  );

  if (typeof resolvedIsPublic === "boolean") {
    for (const file of files) {
      file.isPublic = resolvedIsPublic;
    }
  }

  if (typeof resolvedServeImage === "boolean") {
    for (const file of files) {
      file.serveImage = resolvedServeImage;
    }
  }

  for (const [index, file] of files.entries()) {
    file.acceptedMimeTypes = derivedAcceptedMimeTypesByFile[index];
  }

  const routeFileExpiry = await resolveRouteOption(
    route.routeOptions?.fileExpiry,
    routeOptionData,
  );

  const resolvedFileExpiry =
    input.fileExpiry !== undefined
      ? normalizeRouteExpiryInput(input.fileExpiry)
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
    fileExpiry: resolvedFileExpiry,
    uploadStrategy: input.uploadStrategy ?? "server",
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
      ? (() => {
          const firstStream = registered.registerResult.streams[0];
          const firstResponse = registered.registerResult.responses[0];
          if (!firstStream || !firstResponse) {
            throw new Error(
              "registerRouteUpload did not return a development SSE stream",
            );
          }

          return {
            mode: "development" as const,
            file: firstFile,
            stream: firstStream,
            response: firstResponse,
          };
        })()
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
