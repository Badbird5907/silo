import type { FileRouterInputKey } from "@silo-storage/mime-types";
import type {
  PrepareUploadInput,
  UploadCore,
  UploadFileInput,
} from "@silo-storage/sdk-core";
import type { StringValue } from "ms";

export interface SiloRouteFileConstraint {
  maxFileSize?: string;
  minFileCount?: number;
  maxFileCount?: number;
}

export type SiloRouteConfig = Partial<
  Record<FileRouterInputKey, SiloRouteFileConstraint>
>;

export type SiloRouteConfigInput = readonly string[] | SiloRouteConfig;

export type SiloFileExpiryInput =
  | {
      ttl: string | number;
    }
  | {
      expiresAt: string | Date | null;
    };

export type SiloRouteExpiryInput =
  | SiloFileExpiryInput
  | StringValue
  | Date
  | null;
export type SiloRoutePublicInput = boolean | null | undefined;
export type SiloRouteServeImageInput = boolean | null | undefined;
export type SiloRouteMimeTypesInput = string | string[];

export type CoreFileExpiryInput =
  | {
      ttlSeconds: number;
    }
  | {
      expiresAt: string | Date | null;
    };

export type UploadFileInputWithAcceptedMimeTypes = UploadFileInput & {
  acceptedMimeTypes?: string[];
};

export type SiloRouteOptionResolverArgs<
  TMiddlewareData extends Record<string, unknown>,
  TContext,
> = TMiddlewareData & {
  context: TContext;
};

export type SiloRouteOptionResolver<
  TValue,
  TMiddlewareData extends Record<string, unknown> = Record<string, unknown>,
  TContext = Record<string, never>,
> =
  | TValue
  | undefined
  | ((
      data: SiloRouteOptionResolverArgs<TMiddlewareData, TContext>,
    ) => Promise<TValue | undefined> | TValue | undefined);

export interface SiloRouteOptions {
  isPublic?: SiloRouteOptionResolver<SiloRoutePublicInput>;
  serveImage?: SiloRouteOptionResolver<SiloRouteServeImageInput>;
  fileExpiry?: SiloRouteOptionResolver<SiloRouteExpiryInput | undefined>;
  mimeTypes?: SiloRouteOptionResolver<SiloRouteMimeTypesInput | undefined>;
}

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
  core: UploadCore;
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
  middleware?(
    args: SiloRouteMiddlewareArgs<TRequest, TRouteConfig, TContext, TInput>,
  ): Promise<TMiddlewareData> | TMiddlewareData;
  onUploadComplete(
    args: SiloOnUploadCompleteArgs<TMiddlewareData, TContext>,
  ): Promise<TOutput> | TOutput;
}

export interface SiloRouteBuilder<
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
    isPublic: SiloRouteOptionResolver<
      SiloRoutePublicInput,
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
  serveImage: (
    serveImage: SiloRouteOptionResolver<
      SiloRouteServeImageInput,
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
  expires: (
    fileExpiry: SiloRouteOptionResolver<
      SiloRouteExpiryInput | undefined,
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
  mimeTypes: (
    mimeTypes: SiloRouteOptionResolver<
      SiloRouteMimeTypesInput | undefined,
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

export type FileRouter<
  TRequest = unknown,
  TContext = Record<string, never>,
> = Record<
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
  {
    routeConfig: SiloRouteConfig;
    onUploadComplete(args: unknown): unknown;
  }
>;

export type RouteSlug<TRouter extends Record<string, unknown>> = keyof TRouter &
  string;
export type RouteConfigBySlug<
  TRouter extends Record<string, unknown>,
  TRouteSlug extends RouteSlug<TRouter>,
> = TRouter[TRouteSlug] extends { routeConfig: infer TRouteConfig }
  ? TRouteConfig
  : never;
export type RouteOutputBySlug<
  TRouter extends Record<string, unknown>,
  TRouteSlug extends RouteSlug<TRouter>,
> = InferRouteOutput<TRouter[TRouteSlug]>;
export type RouteInputBySlug<
  TRouter extends Record<string, unknown>,
  TRouteSlug extends RouteSlug<TRouter>,
> =
  TRouter[TRouteSlug] extends SiloFileRoute<
    infer _TRequest,
    infer _TContext,
    infer _TRouteConfig,
    infer _TMiddlewareData,
    infer _TOutput,
    infer TInput
  >
    ? TInput
    : never;

export type InferMiddlewareData<TRoute> =
  TRoute extends SiloFileRoute<
    infer _TRequest,
    infer _TContext,
    infer _TRouteConfig,
    infer TMiddlewareData,
    infer _TOutput,
    infer _TInput
  >
    ? TMiddlewareData
    : never;

export type InferRouteOutput<TRoute> =
  TRoute extends SiloFileRoute<
    infer _TRequest,
    infer _TContext,
    infer _TRouteConfig,
    infer _TMiddlewareData,
    infer TOutput,
    infer _TInput
  >
    ? TOutput
    : never;

export type RouteRegisterInput = Omit<PrepareUploadInput, "callbackMetadata">;

export type RouterConfig<TRouter extends Record<string, unknown>> = {
  [TRouteSlug in RouteSlug<TRouter>]: RouteConfigBySlug<TRouter, TRouteSlug>;
};
