import type { HandleUploadCallbackInput } from "./callback-handler";
import type { FileRouter } from "./router";
import type {
  PrepareRouteUploadInput,
  RegisterRouteUploadInput,
} from "./router/register/types";
import type { SiloRouteBuilder, SiloRouteConfig } from "./router/types";

/**
 * Generic parameters for `createSiloUpload<TRequest, TContext, TInput>()`.
 */
export interface ServerCreateSiloUploadGenerics {
  /**
   * Request type passed into middleware and registration helpers.
   *
   * @default Request
   */
  TRequest: Request;

  /**
   * Server-resolved context shared with middleware, option resolvers, and callbacks.
   *
   * @default Record<string, never>
   */
  TContext: Record<string, never>;

  /**
   * Optional route input type available as `input` inside middleware and helper calls.
   *
   * @default unknown
   */
  TInput: unknown;
}

export interface ServerApiReferenceContext {
  userId: string;
}

export type ServerApiReferenceInput = Record<string, unknown>;

export type ServerApiReferenceRouter = FileRouter<
  Request,
  ServerApiReferenceContext
>;

export type ServerApiReferenceRouteSlug = keyof ServerApiReferenceRouter &
  string;

export type ServerRouteBuilderMethods = SiloRouteBuilder<
  Request,
  ServerApiReferenceContext,
  SiloRouteConfig,
  Record<string, unknown>,
  ServerApiReferenceInput
>;

export type ServerRegisterRouteUploadOptions = RegisterRouteUploadInput<
  ServerApiReferenceRouter,
  ServerApiReferenceRouteSlug,
  Request,
  ServerApiReferenceContext
>;

export type ServerPrepareRouteUploadOptions = PrepareRouteUploadInput<
  ServerApiReferenceRouter,
  ServerApiReferenceRouteSlug,
  Request,
  ServerApiReferenceContext
>;

export type ServerHandleUploadCallbackOptions = HandleUploadCallbackInput<
  Request,
  ServerApiReferenceContext,
  ServerApiReferenceRouter
>;
