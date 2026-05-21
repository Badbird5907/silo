import type { StandardSchemaV1 } from "@standard-schema/spec";

import type {
  MiddlewareFn,
  OnUploadCompleteFn,
  SiloInputSchema,
  SiloRouteBuilder,
  SiloRouteConfig,
  SiloRouteConfigInput,
  SiloRouteExpectResolver,
  SiloRouteOptions,
} from "./types";
import { normalizeRouteConfigInput } from "./normalize";

const defaultRouteConfigInput = ["blob"] as const;

function resolveStaticRouteConfig(
  expects:
    | SiloRouteConfigInput
    | SiloRouteExpectResolver<Record<string, unknown>, unknown, unknown>
    | undefined,
): SiloRouteConfig | undefined {
  if (typeof expects === "function") {
    return undefined;
  }

  return normalizeRouteConfigInput(expects ?? defaultRouteConfigInput);
}

function createRouteBuilder<
  TRequest,
  TContext,
  TMiddlewareData extends Record<string, unknown>,
  TInput,
  THasExpects extends boolean,
>(
  routeConfig: SiloRouteConfig | undefined,
  routeOptions: SiloRouteOptions<TMiddlewareData, TContext, TInput> | undefined,
  inputSchema: SiloInputSchema<unknown, TInput> | undefined,
  middleware:
    | MiddlewareFn<TRequest, TMiddlewareData, TContext, TInput>
    | undefined,
  expects:
    | SiloRouteConfigInput
    | SiloRouteExpectResolver<TMiddlewareData, TContext, TInput>
    | undefined,
  hasExpects: THasExpects,
): SiloRouteBuilder<TRequest, TContext, TMiddlewareData, TInput, THasExpects> {
  const withRouteOptions = (
    nextRouteOptions: SiloRouteOptions<TMiddlewareData, TContext, TInput>,
  ) =>
    createRouteBuilder<
      TRequest,
      TContext,
      TMiddlewareData,
      TInput,
      THasExpects
    >(
      routeConfig,
      nextRouteOptions,
      inputSchema,
      middleware,
      expects,
      hasExpects,
    );

  const builder = {
    middleware: <TNextMiddlewareData extends Record<string, unknown>>(
      nextMiddleware: MiddlewareFn<
        TRequest,
        TNextMiddlewareData,
        TContext,
        TInput
      >,
    ) =>
      createRouteBuilder<
        TRequest,
        TContext,
        TNextMiddlewareData,
        TInput,
        THasExpects
      >(
        routeConfig,
        routeOptions as unknown as SiloRouteOptions<
          TNextMiddlewareData,
          TContext,
          TInput
        >,
        inputSchema,
        nextMiddleware,
        expects as
          | SiloRouteConfigInput
          | SiloRouteExpectResolver<TNextMiddlewareData, TContext, TInput>
          | undefined,
        hasExpects,
      ),
    expects: (
      nextExpects:
        | SiloRouteConfigInput
        | SiloRouteExpectResolver<TMiddlewareData, TContext, TInput>,
    ) =>
      createRouteBuilder<TRequest, TContext, TMiddlewareData, TInput, true>(
        resolveStaticRouteConfig(
          nextExpects as
            | SiloRouteConfigInput
            | SiloRouteExpectResolver<
                Record<string, unknown>,
                unknown,
                unknown
              >,
        ),
        routeOptions,
        inputSchema,
        middleware,
        nextExpects,
        true,
      ),
    public: (
      isPublic: SiloRouteOptions<TMiddlewareData, TContext, TInput>["isPublic"],
    ) =>
      withRouteOptions({
        ...routeOptions,
        isPublic,
      }),
    serveImage: (
      serveImage: SiloRouteOptions<
        TMiddlewareData,
        TContext,
        TInput
      >["serveImage"],
    ) =>
      withRouteOptions({
        ...routeOptions,
        serveImage,
      }),
    expires: (
      fileExpiry: SiloRouteOptions<
        TMiddlewareData,
        TContext,
        TInput
      >["fileExpiry"],
    ) =>
      withRouteOptions({
        ...routeOptions,
        fileExpiry,
      }),
    onUploadComplete: <TOutput>(
      onUploadComplete: OnUploadCompleteFn<TMiddlewareData, TOutput, TContext>,
    ) => ({
      routeConfig,
      expects,
      routeOptions,
      inputSchema,
      middleware,
      onUploadComplete,
    }),
  };

  return builder as unknown as SiloRouteBuilder<
    TRequest,
    TContext,
    TMiddlewareData,
    TInput,
    THasExpects
  >;
}

export function createSiloUpload<
  TRequest = Request,
  TContext = Record<string, never>,
>(): {
  (): SiloRouteBuilder<
    TRequest,
    TContext,
    Record<string, never>,
    undefined,
    false
  >;
  <TSchema extends SiloInputSchema>(
    schema: TSchema,
  ): SiloRouteBuilder<
    TRequest,
    TContext,
    Record<string, never>,
    StandardSchemaV1.InferOutput<TSchema>,
    false
  >;
} {
  return ((schema?: SiloInputSchema) =>
    createRouteBuilder<
      TRequest,
      TContext,
      Record<string, never>,
      unknown,
      false
    >(
      normalizeRouteConfigInput(defaultRouteConfigInput),
      undefined,
      schema as SiloInputSchema<unknown, unknown> | undefined,
      undefined,
      undefined,
      false,
    )) as {
    (): SiloRouteBuilder<
      TRequest,
      TContext,
      Record<string, never>,
      undefined,
      false
    >;
    <TSchema extends SiloInputSchema>(
      schema: TSchema,
    ): SiloRouteBuilder<
      TRequest,
      TContext,
      Record<string, never>,
      StandardSchemaV1.InferOutput<TSchema>,
      false
    >;
  };
}
