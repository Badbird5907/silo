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
  isPublic?: SiloRouteOptionResolver<boolean>;
  fileExpiry?: SiloRouteOptionResolver<SiloRouteExpiryInput>;
}

export type SiloFileExpiryInput =
  | {
      ttl: string | number;
    }
  | {
      expiresAt: string | Date | null;
    };

export type SiloRouteExpiryInput = SiloFileExpiryInput | StringValue | Date;

type CoreFileExpiryInput =
  | {
      ttlSeconds: number;
    }
  | {
      expiresAt: string | Date | null;
    };

type SiloRouteOptionResolverArgs<
  TMiddlewareData extends Record<string, unknown>,
  TContext,
> = TMiddlewareData & {
  context: TContext;
};

type SiloRouteOptionResolver<
  TValue,
  TMiddlewareData extends Record<string, unknown> = Record<string, unknown>,
  TContext = Record<string, never>,
> =
  | TValue
  | ((
      data: SiloRouteOptionResolverArgs<TMiddlewareData, TContext>,
    ) => Promise<TValue> | TValue);

export interface SiloRouteMiddlewareArgs<
  TRequest,
  TRouteConfig extends SiloRouteConfig,
  TContext = Record<string, never>,
  TInput = unknown,
> {
  req: TRequest;
  context: TContext;
  input?: TInput;
  files: UploadFileInput[];
  routeConfig: TRouteConfig;
  routeSlug: string;
}

export interface SiloOnUploadCompleteArgs<
  TMiddlewareData,
  TContext = Record<string, never>,
> {
  metadata: TMiddlewareData;
  context: TContext;
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
  TContext = Record<string, never>,
  TInput = unknown,
> = (
  args: SiloRouteMiddlewareArgs<TRequest, TRouteConfig, TContext, TInput>,
) => Promise<TMiddlewareData> | TMiddlewareData;

export type OnUploadCompleteFn<
  TMiddlewareData extends Record<string, unknown>,
  TOutput,
  TContext = Record<string, never>,
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
  public: (
    isPublic: SiloRouteOptionResolver<boolean, TMiddlewareData, TContext>,
  ) => SiloRouteBuilder<
    TRequest,
    TContext,
    TRouteConfig,
    TMiddlewareData,
    TInput
  >;
  expires: (
    fileExpiry: SiloRouteOptionResolver<
      SiloRouteExpiryInput,
      TMiddlewareData,
      TContext
    >,
  ) => SiloRouteBuilder<
    TRequest,
    TContext,
    TRouteConfig,
    TMiddlewareData,
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

export type FileRouter<TRequest = unknown, TContext = Record<string, never>> = Record<
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
  const withRouteOptions = (
    nextRouteOptions: SiloRouteOptions,
  ): SiloRouteBuilder<TRequest, TContext, TRouteConfig, TMiddlewareData, TInput> =>
    createRouteBuilder<TRequest, TContext, TRouteConfig, TMiddlewareData, TInput>(
      routeConfig,
      nextRouteOptions,
      middleware,
    );

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
    public: (isPublic) =>
      withRouteOptions({
        ...routeOptions,
        isPublic: isPublic as SiloRouteOptions["isPublic"],
      }),
    expires: (fileExpiry) =>
      withRouteOptions({
        ...routeOptions,
        fileExpiry: fileExpiry as SiloRouteOptions["fileExpiry"],
      }),
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
  TContext = Record<string, never>,
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

function normalizeRouteExpiryInput(
  fileExpiry: SiloRouteExpiryInput,
): CoreFileExpiryInput {
  if (typeof fileExpiry === "string" || fileExpiry instanceof Date) {
    if (fileExpiry instanceof Date) {
      return {
        expiresAt: fileExpiry,
      };
    }
    return normalizeFileExpiry({ ttl: fileExpiry });
  }

  return normalizeFileExpiry(fileExpiry);
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

export interface RegisterRouteUploadInput<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = Record<string, never>,
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
  const files = input.files.map((file) => ({
    ...file,
    // Route-level boolean setting is authoritative; client payload cannot override it.
    // Function-based settings are resolved after middleware.
    isPublic: typeof routeIsPublic === "boolean" ? routeIsPublic : undefined,
  }));

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
      // Route-level setting is authoritative; client payload cannot override it.
      file.isPublic = resolvedIsPublic;
    }
  }

  const routeFileExpiry = await resolveRouteOption(
    route.routeOptions?.fileExpiry,
    routeOptionData,
  );

  const resolvedFileExpiry = input.fileExpiry
    ? normalizeFileExpiry(input.fileExpiry)
    : routeFileExpiry
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

export interface PrepareRouteUploadInput<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = Record<string, never>,
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
