import type { AllowedFileType } from "@silo-storage/mime-types";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  PrepareUploadInput,
  UploadCore,
  UploadFileInput,
} from "@silo-storage/sdk-core";
import type { StringValue } from "ms";

export type SiloRouteTypeKey = AllowedFileType | `${string}/${string}`;

export interface SiloRouteFileConstraint {
  maxFileSize?: string;
  minFileCount?: number;
  maxFileCount?: number;
  mimeTypes?: string | readonly string[];
}

export interface SiloRouteExpectBucket extends SiloRouteFileConstraint {
  type?: SiloRouteTypeKey;
}

export type SiloRouteExpectObject = Partial<
  Record<SiloRouteTypeKey, SiloRouteFileConstraint>
>;

export type SiloRouteExpectArray = readonly SiloRouteExpectBucket[];

export type SiloRouteConfigInput =
  | readonly string[]
  | SiloRouteExpectObject
  | SiloRouteExpectArray;

export interface SiloRouteConfigBucket {
  type?: SiloRouteTypeKey;
  mimeTypes?: readonly string[];
  maxFileSize?: string;
  minFileCount?: number;
  maxFileCount?: number;
}

export type SiloRouteConfig = readonly SiloRouteConfigBucket[];

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
  TInput = unknown,
> = TMiddlewareData & {
  context: TContext;
  input: TInput;
};

export type SiloRouteOptionResolver<
  TValue,
  TMiddlewareData extends Record<string, unknown> = Record<string, unknown>,
  TContext = Record<string, never>,
  TInput = unknown,
> =
  | TValue
  | undefined
  | ((
      data: SiloRouteOptionResolverArgs<TMiddlewareData, TContext, TInput>,
    ) => Promise<TValue | undefined> | TValue | undefined);

export type SiloRouteExpectResolver<
  TMiddlewareData extends Record<string, unknown> = Record<string, unknown>,
  TContext = Record<string, never>,
  TInput = unknown,
> = (
  data: SiloRouteOptionResolverArgs<TMiddlewareData, TContext, TInput>,
) => Promise<SiloRouteConfigInput> | SiloRouteConfigInput;

export interface SiloRouteOptions<
  TMiddlewareData extends Record<string, unknown> = Record<string, unknown>,
  TContext = Record<string, never>,
  TInput = unknown,
> {
  isPublic?: SiloRouteOptionResolver<
    SiloRoutePublicInput,
    TMiddlewareData,
    TContext,
    TInput
  >;
  serveImage?: SiloRouteOptionResolver<
    SiloRouteServeImageInput,
    TMiddlewareData,
    TContext,
    TInput
  >;
  fileExpiry?: SiloRouteOptionResolver<
    SiloRouteExpiryInput | undefined,
    TMiddlewareData,
    TContext,
    TInput
  >;
}

export interface SiloRouteMiddlewareArgs<
  TRequest,
  TContext = Record<string, never>,
  TInput = unknown,
> {
  req: TRequest;
  context: TContext;
  input: TInput;
  files: UploadFileInput[];
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
    expiresAt: string | null;
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
      expiresAt: string | null;
      metadata: Record<string, unknown>;
    };
  };
}

export type MiddlewareFn<
  TRequest,
  TMiddlewareData extends Record<string, unknown>,
  TContext = Record<string, never>,
  TInput = unknown,
> = (
  args: SiloRouteMiddlewareArgs<TRequest, TContext, TInput>,
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
  TMiddlewareData extends Record<string, unknown>,
  TOutput,
  TInput = unknown,
> {
  routeConfig?: SiloRouteConfig;
  expects?:
    | SiloRouteConfigInput
    | SiloRouteExpectResolver<TMiddlewareData, TContext, TInput>;
  routeOptions?: SiloRouteOptions<TMiddlewareData, TContext, TInput>;
  inputSchema?: StandardSchemaV1<unknown, TInput>;
  readonly "~types"?: {
    input: TInput;
    output: TOutput;
  };
  middleware?(
    args: SiloRouteMiddlewareArgs<TRequest, TContext, TInput>,
  ): Promise<TMiddlewareData> | TMiddlewareData;
  onUploadComplete(
    args: SiloOnUploadCompleteArgs<TMiddlewareData, TContext>,
  ): Promise<TOutput> | TOutput;
}

export interface SiloRouteBuilderBase<
  TRequest,
  TContext,
  TMiddlewareData extends Record<string, unknown>,
  TInput,
  THasExpects extends boolean,
>{
  expects: (
    expects:
      | SiloRouteConfigInput
      | SiloRouteExpectResolver<TMiddlewareData, TContext, TInput>,
  ) => SiloRouteBuilder<
    TRequest,
    TContext,
    TMiddlewareData,
    TInput,
    true
  >;
  public: (
    isPublic: SiloRouteOptionResolver<
      SiloRoutePublicInput,
      TMiddlewareData,
      TContext,
      TInput
    >,
  ) => SiloRouteBuilder<
    TRequest,
    TContext,
    TMiddlewareData,
    TInput,
    THasExpects
  >;
  serveImage: (
    serveImage: SiloRouteOptionResolver<
      SiloRouteServeImageInput,
      TMiddlewareData,
      TContext,
      TInput
    >,
  ) => SiloRouteBuilder<
    TRequest,
    TContext,
    TMiddlewareData,
    TInput,
    THasExpects
  >;
  expires: (
    fileExpiry: SiloRouteOptionResolver<
      SiloRouteExpiryInput | undefined,
      TMiddlewareData,
      TContext,
      TInput
    >,
  ) => SiloRouteBuilder<
    TRequest,
    TContext,
    TMiddlewareData,
    TInput,
    THasExpects
  >;
  onUploadComplete: <TOutput>(
    onUploadComplete: OnUploadCompleteFn<TMiddlewareData, TOutput, TContext>,
  ) => SiloFileRoute<TRequest, TContext, TMiddlewareData, TOutput, TInput>;
}

type SiloRouteBuilderMiddlewareMethods<
  TRequest,
  TContext,
  _TMiddlewareData extends Record<string, unknown>,
  TInput,
  THasExpects extends boolean,
> = THasExpects extends false
  ? {
      middleware: <TNextMiddlewareData extends Record<string, unknown>>(
        middleware: MiddlewareFn<
          TRequest,
          TNextMiddlewareData,
          TContext,
          TInput
        >,
      ) => SiloRouteBuilder<
        TRequest,
        TContext,
        TNextMiddlewareData,
        TInput,
        false
      >;
    }
  : Record<never, never>;

export type SiloRouteBuilder<
  TRequest,
  TContext,
  TMiddlewareData extends Record<string, unknown>,
  TInput = unknown,
  THasExpects extends boolean = false,
> = SiloRouteBuilderBase<
  TRequest,
  TContext,
  TMiddlewareData,
  TInput,
  THasExpects
> &
  SiloRouteBuilderMiddlewareMethods<
    TRequest,
    TContext,
    TMiddlewareData,
    TInput,
    THasExpects
  >;

export interface AnyFileRoute {
  routeConfig?: SiloRouteConfig;
  expects?: unknown;
  routeOptions?: {
    isPublic?: unknown;
    serveImage?: unknown;
    fileExpiry?: unknown;
  };
  inputSchema?: StandardSchemaV1<unknown, unknown>;
  readonly "~types"?: {
    input: unknown;
    output: unknown;
  };
  middleware?(args: unknown): unknown;
  onUploadComplete(args: unknown): unknown;
}

export type FileRouter<
  _TRequest = unknown,
  _TContext = Record<string, never>,
> = Record<string, AnyFileRoute>;

export type AnyFileRouter = Record<string, AnyFileRoute>;

export type RouteSlug<TRouter extends Record<string, unknown>> = keyof TRouter &
  string;
export type RouteConfigBySlug<
  TRouter extends Record<string, unknown>,
  TRouteSlug extends RouteSlug<TRouter>,
> = TRouter[TRouteSlug] extends { routeConfig?: infer TRouteConfig }
  ? Exclude<TRouteConfig, undefined>
  : never;
export type RouteOutputBySlug<
  TRouter extends Record<string, unknown>,
  TRouteSlug extends RouteSlug<TRouter>,
> = InferRouteOutput<TRouter[TRouteSlug]>;
export type RouteInputBySlug<
  TRouter extends Record<string, unknown>,
  TRouteSlug extends RouteSlug<TRouter>,
> = InferRouteInput<TRouter[TRouteSlug]>;

export type InferMiddlewareData<TRoute> =
  TRoute extends SiloFileRoute<
    infer _TRequest,
    infer _TContext,
    infer TMiddlewareData,
    infer _TOutput,
    infer _TInput
  >
    ? TMiddlewareData
    : never;

export type InferRouteInput<TRoute> =
  TRoute extends {
    readonly "~types"?: {
      input: infer TInput;
    };
  }
    ? TInput
    : TRoute extends SiloFileRoute<
          infer _TRequest,
          infer _TContext,
          infer _TMiddlewareData,
          infer _TOutput,
          infer TInput
        >
      ? TInput
      : never;

export type InferRouteOutput<TRoute> =
  TRoute extends {
    readonly "~types"?: {
      output: infer TOutput;
    };
  }
    ? TOutput
    : TRoute extends SiloFileRoute<
          infer _TRequest,
          infer _TContext,
          infer _TMiddlewareData,
          infer TOutput,
          infer _TInput
        >
      ? TOutput
      : never;

export type RouteRegisterInput = Omit<PrepareUploadInput, "callbackMetadata">;

export type SiloStandardSchema<
  TInput = unknown,
  TOutput = TInput,
> = StandardSchemaV1<TInput, TOutput>;

export type SiloInputSchema<TInput = unknown, TOutput = TInput> =
  SiloStandardSchema<TInput, TOutput>;

export type RouterConfig<TRouter extends Record<string, unknown>> = Partial<{
  [TRouteSlug in RouteSlug<TRouter>]: RouteConfigBySlug<TRouter, TRouteSlug>;
}>;
