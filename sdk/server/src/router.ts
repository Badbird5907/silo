import type {
  PrepareUploadInput,
  RegisterUploadBatchResult,
  UploadCore,
  UploadFileInput,
} from "@silo-storage/sdk-core";
import ms from "ms";
import type { StringValue } from "ms";

import { buildInternalCallbackMetadata } from "./envelope";

export interface SiloRouteFileConstraint {
  maxFileSize?: string;
  minFileCount?: number;
  maxFileCount?: number;
}

export type SiloRouteConfig = Record<string, SiloRouteFileConstraint>;

export interface SiloRouteOptions {
  isPublic?: boolean;
  fileExpiry?: SiloFileExpiryInput;
}

export type SiloFileExpiryInput =
  | {
      ttl: string | number;
    }
  | {
      expiresAt: string | Date | null;
    };

type CoreFileExpiryInput =
  | {
      ttlSeconds: number;
    }
  | {
      expiresAt: string | Date | null;
    };

export interface SiloRouteMiddlewareArgs<
  TRequest,
  TRouteConfig extends SiloRouteConfig,
  TContext = undefined,
  TInput = unknown,
> {
  req: TRequest;
  context?: TContext;
  input?: TInput;
  files: UploadFileInput[];
  routeConfig: TRouteConfig;
  routeSlug: string;
}

export interface SiloOnUploadCompleteArgs<
  TMiddlewareData,
  TContext = undefined,
> {
  metadata: TMiddlewareData;
  context?: TContext;
  file: {
    environmentId: string;
    projectId: string;
    fileKeyId: string;
    accessKey: string;
    fileId: string;
    fileName: string;
    hash: string | null;
    mimeType: string;
    size: number;
    metadata: Record<string, unknown>;
  };
  event: {
    id: string;
    type: "upload.completed";
    version: 1;
    occurredAt: string;
    data: {
      environmentId: string;
      projectId: string;
      fileKeyId: string;
      accessKey: string;
      fileId: string;
      fileName: string;
      hash: string | null;
      mimeType: string;
      size: number;
      metadata: Record<string, unknown>;
    };
  };
}

export type MiddlewareFn<
  TRequest,
  TRouteConfig extends SiloRouteConfig,
  TMiddlewareData extends Record<string, unknown>,
  TContext = undefined,
  TInput = unknown,
> = (
  args: SiloRouteMiddlewareArgs<TRequest, TRouteConfig, TContext, TInput>,
) => Promise<TMiddlewareData> | TMiddlewareData;

export type OnUploadCompleteFn<
  TMiddlewareData extends Record<string, unknown>,
  TOutput,
  TContext = undefined,
> = (
  args: SiloOnUploadCompleteArgs<TMiddlewareData, TContext>,
) => Promise<TOutput> | TOutput;

export interface SiloFileRoute<
  TRequest,
  TContext,
  TRouteConfig extends SiloRouteConfig,
  TMiddlewareData extends Record<string, unknown>,
  TOutput,
  TInput = unknown,
> {
  routeConfig: TRouteConfig;
  routeOptions?: SiloRouteOptions;
  middleware?: MiddlewareFn<
    TRequest,
    TRouteConfig,
    TMiddlewareData,
    TContext,
    TInput
  >;
  onUploadComplete: OnUploadCompleteFn<TMiddlewareData, TOutput, TContext>;
}

interface SiloRouteBuilder<
  TRequest,
  TContext,
  TRouteConfig extends SiloRouteConfig,
  TMiddlewareData extends Record<string, unknown>,
  TInput = unknown,
> {
  middleware: <TNextMiddlewareData extends Record<string, unknown>>(
    middleware: MiddlewareFn<
      TRequest,
      TRouteConfig,
      TNextMiddlewareData,
      TContext,
      TInput
    >,
  ) => SiloRouteBuilder<
    TRequest,
    TContext,
    TRouteConfig,
    TNextMiddlewareData,
    TInput
  >;
  onUploadComplete: <TOutput>(
    onUploadComplete: OnUploadCompleteFn<TMiddlewareData, TOutput, TContext>,
  ) => SiloFileRoute<
    TRequest,
    TContext,
    TRouteConfig,
    TMiddlewareData,
    TOutput,
    TInput
  >;
}

export type FileRouter<TRequest = unknown, TContext = undefined> = Record<
  string,
  SiloFileRoute<
    TRequest,
    TContext,
    SiloRouteConfig,
    Record<string, unknown>,
    unknown,
    unknown
  >
>;

export type AnyFileRouter = Record<
  string,
  SiloFileRoute<
    never,
    never,
    SiloRouteConfig,
    Record<string, unknown>,
    unknown,
    unknown
  >
>;
export type RouteSlug<TRouter extends AnyFileRouter> = keyof TRouter & string;
export type RouteConfigBySlug<
  TRouter extends AnyFileRouter,
  TRouteSlug extends RouteSlug<TRouter>,
> = TRouter[TRouteSlug]["routeConfig"];
export type RouteOutputBySlug<
  TRouter extends AnyFileRouter,
  TRouteSlug extends RouteSlug<TRouter>,
> = InferRouteOutput<TRouter[TRouteSlug]>;
export type RouteInputBySlug<
  TRouter extends AnyFileRouter,
  TRouteSlug extends RouteSlug<TRouter>,
> =
  TRouter[TRouteSlug] extends SiloFileRoute<
    unknown,
    unknown,
    SiloRouteConfig,
    Record<string, unknown>,
    unknown,
    infer TInput
  >
    ? TInput
    : never;

export type InferMiddlewareData<TRoute> =
  TRoute extends SiloFileRoute<
    unknown,
    unknown,
    SiloRouteConfig,
    infer TMiddlewareData,
    unknown,
    unknown
  >
    ? TMiddlewareData
    : never;

export type InferRouteOutput<TRoute> =
  TRoute extends SiloFileRoute<
    unknown,
    unknown,
    SiloRouteConfig,
    Record<string, unknown>,
    infer TOutput,
    unknown
  >
    ? TOutput
    : never;

function createRouteBuilder<
  TRequest,
  TContext,
  TRouteConfig extends SiloRouteConfig,
  TMiddlewareData extends Record<string, unknown>,
  TInput = unknown,
>(
  routeConfig: TRouteConfig,
  routeOptions?: SiloRouteOptions,
  middleware?: MiddlewareFn<
    TRequest,
    TRouteConfig,
    TMiddlewareData,
    TContext,
    TInput
  >,
): SiloRouteBuilder<TRequest, TContext, TRouteConfig, TMiddlewareData, TInput> {
  return {
    middleware: <TNextMiddlewareData extends Record<string, unknown>>(
      nextMiddleware: MiddlewareFn<
        TRequest,
        TRouteConfig,
        TNextMiddlewareData,
        TContext,
        TInput
      >,
    ) =>
      createRouteBuilder<
        TRequest,
        TContext,
        TRouteConfig,
        TNextMiddlewareData,
        TInput
      >(routeConfig, routeOptions, nextMiddleware),
    onUploadComplete: <TOutput>(
      onUploadComplete: OnUploadCompleteFn<TMiddlewareData, TOutput, TContext>,
    ) => ({
      routeConfig,
      routeOptions,
      middleware,
      onUploadComplete,
    }),
  };
}

export function createSiloUpload<
  TRequest = Request,
  TContext = undefined,
  TInput = unknown,
>() {
  return <TRouteConfig extends SiloRouteConfig>(
    routeConfig: TRouteConfig,
    routeOptions?: SiloRouteOptions,
  ) =>
    createRouteBuilder<
      TRequest,
      TContext,
      TRouteConfig,
      Record<string, never>,
      TInput
    >(routeConfig, routeOptions);
}

function toRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function normalizeFileExpiry(
  fileExpiry: SiloFileExpiryInput,
): CoreFileExpiryInput {
  if ("ttl" in fileExpiry) {
    if (typeof fileExpiry.ttl === "number") {
      if (!Number.isFinite(fileExpiry.ttl) || fileExpiry.ttl <= 0) {
        throw new Error("fileExpiry.ttl number must be a positive value");
      }
      return {
        ttlSeconds: Math.ceil(fileExpiry.ttl / 1000),
      };
    }

    const ttlMs = ms(fileExpiry.ttl as StringValue);
    if (typeof ttlMs !== "number" || ttlMs <= 0) {
      throw new Error(
        `Invalid fileExpiry.ttl value "${fileExpiry.ttl}". Example: "1 day" or "7d"`,
      );
    }

    return {
      ttlSeconds: Math.ceil(ttlMs / 1000),
    };
  }

  return {
    expiresAt: fileExpiry.expiresAt,
  };
}

export interface RegisterRouteUploadInput<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = undefined,
> {
  core: UploadCore;
  router: TRouter;
  routeSlug: TRouteSlug;
  req: TRequest;
  context?: TContext;
  input?: RouteInputBySlug<TRouter, TRouteSlug>;
  files: UploadFileInput[];
  callbackUrl?: string;
  requestMetadata?: Record<string, unknown>;
  fileExpiry?: SiloFileExpiryInput;
  dev?: boolean;
  expiresIn?: number;
  protocol?: "http" | "https";
}

export interface RegisterRouteUploadResult<
  TMiddlewareData extends Record<string, unknown>,
> {
  routeSlug: string;
  middlewareData: TMiddlewareData;
  callbackMetadata: Record<string, unknown>;
  registerResult: RegisterUploadBatchResult;
}

export async function registerRouteUpload<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = undefined,
>(
  input: RegisterRouteUploadInput<TRouter, TRouteSlug, TRequest, TContext>,
): Promise<
  RegisterRouteUploadResult<InferMiddlewareData<TRouter[TRouteSlug]>>
> {
  const route = input.router[input.routeSlug];
  if (!route) {
    throw new Error(`Unknown route slug "${input.routeSlug}"`);
  }

  const files = input.files.map((file) => ({
    ...file,
    // Route-level setting is authoritative; client payload cannot override it.
    isPublic: route.routeOptions?.isPublic,
  }));

  const middlewareData = route.middleware
    ? toRecord(
        await route.middleware({
          req: input.req,
          context: input.context,
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

  const resolvedFileExpiry = input.fileExpiry
    ? normalizeFileExpiry(input.fileExpiry)
    : route.routeOptions?.fileExpiry
      ? normalizeFileExpiry(route.routeOptions.fileExpiry)
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

export interface PrepareRouteUploadInput<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = undefined,
> extends Omit<
  RegisterRouteUploadInput<TRouter, TRouteSlug, TRequest, TContext>,
  "files"
> {
  file: UploadFileInput;
}

export interface PrepareRouteUploadResult<
  TMiddlewareData extends Record<string, unknown>,
> {
  routeSlug: string;
  middlewareData: TMiddlewareData;
  callbackMetadata: Record<string, unknown>;
  prepareResult: Awaited<ReturnType<UploadCore["prepareUpload"]>>;
}

export async function prepareRouteUpload<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = undefined,
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

export type RouteRegisterInput = Omit<PrepareUploadInput, "callbackMetadata">;

export type RouterConfig<TRouter extends AnyFileRouter> = {
  [TRouteSlug in RouteSlug<TRouter>]: RouteConfigBySlug<TRouter, TRouteSlug>;
};

export function extractRouterConfig<TRouter extends AnyFileRouter>(
  router: TRouter,
): RouterConfig<TRouter> {
  const entries = Object.entries(router).map(([routeSlug, route]) => [
    routeSlug,
    route.routeConfig,
  ]);
  return Object.fromEntries(entries) as RouterConfig<TRouter>;
}
