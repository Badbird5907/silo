import type { StandardSchemaV1 } from "@standard-schema/spec";

import type {
  MiddlewareFn,
  OnUploadCompleteFn,
  SiloInputSchema,
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
  routeOptions?: SiloRouteOptions<TMiddlewareData, TContext, TInput>,
  inputSchema?: SiloInputSchema<unknown, TInput>,
  middleware?: MiddlewareFn<
    TRequest,
    TRouteConfig,
    TMiddlewareData,
    TContext,
    TInput
  >,
): SiloRouteBuilder<TRequest, TContext, TRouteConfig, TMiddlewareData, TInput> {
  const withRouteOptions = (
    nextRouteOptions: SiloRouteOptions<TMiddlewareData, TContext, TInput>,
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
    >(routeConfig, nextRouteOptions, inputSchema, middleware);

  return {
    input: <TSchema extends SiloInputSchema>(schema: TSchema) =>
      createRouteBuilder<
        TRequest,
        TContext,
        TRouteConfig,
        TMiddlewareData,
        StandardSchemaV1.InferOutput<TSchema>
      >(
        routeConfig,
        routeOptions as SiloRouteOptions<
          TMiddlewareData,
          TContext,
          StandardSchemaV1.InferOutput<TSchema>
        >,
        schema as SiloInputSchema<unknown, StandardSchemaV1.InferOutput<TSchema>>,
        middleware as MiddlewareFn<
          TRequest,
          TRouteConfig,
          TMiddlewareData,
          TContext,
          StandardSchemaV1.InferOutput<TSchema>
        > | undefined,
      ),
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
      >(
        routeConfig,
        routeOptions as unknown as SiloRouteOptions<
          TNextMiddlewareData,
          TContext,
          TInput
        >,
        inputSchema,
        nextMiddleware,
      ),
    public: (isPublic) =>
      withRouteOptions({
        ...routeOptions,
        isPublic:
          isPublic as SiloRouteOptions<
            TMiddlewareData,
            TContext,
            TInput
          >["isPublic"],
      }),
    serveImage: (serveImage) =>
      withRouteOptions({
        ...routeOptions,
        serveImage:
          serveImage as SiloRouteOptions<
            TMiddlewareData,
            TContext,
            TInput
          >["serveImage"],
      }),
    expires: (fileExpiry) =>
      withRouteOptions({
        ...routeOptions,
        fileExpiry:
          fileExpiry as SiloRouteOptions<
            TMiddlewareData,
            TContext,
            TInput
          >["fileExpiry"],
      }),
    mimeTypes: (mimeTypes) =>
      withRouteOptions({
        ...routeOptions,
        mimeTypes:
          mimeTypes as SiloRouteOptions<
            TMiddlewareData,
            TContext,
            TInput
          >["mimeTypes"],
      }),
    onUploadComplete: <TOutput>(
      onUploadComplete: OnUploadCompleteFn<TMiddlewareData, TOutput, TContext>,
    ) => ({
      routeConfig,
      routeOptions,
      inputSchema,
      middleware,
      onUploadComplete,
    }),
  };
}

export function createSiloUpload<
  TRequest = Request,
  TContext = Record<string, never>,
>(): <TRouteConfigInput extends SiloRouteConfigInput>(
  routeConfigInput: TRouteConfigInput,
  routeOptions?: SiloRouteOptions<Record<string, never>, TContext, undefined>,
) => SiloRouteBuilder<
  TRequest,
  TContext,
  ReturnType<typeof normalizeRouteConfigInput>,
  Record<string, never>,
  undefined
>;
export function createSiloUpload<
  TRequest = Request,
  TContext = Record<string, never>,
  TLegacyInput = unknown,
>(): <TRouteConfigInput extends SiloRouteConfigInput>(
  routeConfigInput: TRouteConfigInput,
  routeOptions?: SiloRouteOptions<
    Record<string, never>,
    TContext,
    TLegacyInput
  >,
) => SiloRouteBuilder<
  TRequest,
  TContext,
  ReturnType<typeof normalizeRouteConfigInput>,
  Record<string, never>,
  TLegacyInput
>;
export function createSiloUpload<
  TRequest = Request,
  TContext = Record<string, never>,
  TInput = undefined,
>() {
  return <TRouteConfigInput extends SiloRouteConfigInput>(
    routeConfigInput: TRouteConfigInput,
    routeOptions?: SiloRouteOptions<Record<string, never>, TContext, TInput>,
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
