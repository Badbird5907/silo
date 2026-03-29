import type {
  RegisterUploadBatchResult,
  UploadCore,
  UploadFileInput,
} from "@silo-storage/sdk-core";

import type {
  FileRouter,
  InferMiddlewareData,
  RouteInputBySlug,
  SiloFileExpiryInput,
} from "../types";

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

export type PreparedRouteUploadResultBySlug<
  TRouter extends FileRouter<TRequest, TContext>,
  TRouteSlug extends keyof TRouter & string,
  TRequest,
  TContext = Record<string, never>,
> = PrepareRouteUploadResult<InferMiddlewareData<TRouter[TRouteSlug]>>;
