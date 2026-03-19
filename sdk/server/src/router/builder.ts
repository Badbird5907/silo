import type {
  MiddlewareFn,
  OnUploadCompleteFn,
  SiloRouteBuilder,
  SiloRouteConfig,
  SiloRouteConfigInput,
  SiloRouteOptions,
} from "./types";
import { normalizeRouteConfigInput } from "./normalize";

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
  ): SiloRouteBuilder<
    TRequest,
    TContext,
    TRouteConfig,
    TMiddlewareData,
    TInput
  > =>
    createRouteBuilder<
      TRequest,
      TContext,
      TRouteConfig,
      TMiddlewareData,
      TInput
    >(routeConfig, nextRouteOptions, middleware);

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
    mimeTypes: (mimeTypes) =>
      withRouteOptions({
        ...routeOptions,
        mimeTypes: mimeTypes as SiloRouteOptions["mimeTypes"],
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
  return <TRouteConfigInput extends SiloRouteConfigInput>(
    routeConfigInput: TRouteConfigInput,
    routeOptions?: SiloRouteOptions,
  ) => {
    const routeConfig = normalizeRouteConfigInput(routeConfigInput);

    return createRouteBuilder<
      TRequest,
      TContext,
      typeof routeConfig,
      Record<string, never>,
      TInput
    >(routeConfig, routeOptions);
  };
}
