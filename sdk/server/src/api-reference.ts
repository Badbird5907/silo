import type { HandleUploadCallbackInput } from "./callback-handler";
import type {
  CompletionStore,
  CreateFetchRouteHandlerOptions,
} from "./fetch-route-handler";
import type { CreateHttpCompletionStoreOptions } from "./http-completion-store";
import type { FileRouter } from "./router";
import type {
  PrepareRouteUploadInput,
  RegisterRouteUploadInput,
} from "./router/register/types";
import type { SiloRouteBuilder, SiloRouteConfig } from "./router/types";

/**
 * Generic parameters for `createSiloUpload<TRequest, TContext, TLegacyInput>()`.
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
   * Legacy shared route input type.
   *
   * Prefer `.input(schema)` on individual routes for new code.
   *
   * @default only when explicitly provided
   */
  TLegacyInput: unknown;
}

export interface ServerApiReferenceContext {
  userId: string;
}

export type ServerApiReferenceInput = Record<string, unknown>;

export type ServerApiReferenceRouter = FileRouter<
  Request,
  ServerApiReferenceContext
>;

export type ServerApiReferenceRouteSlug = keyof ServerApiReferenceRouter;

export type ServerRouteBuilderMethods = SiloRouteBuilder<
  Request,
  ServerApiReferenceContext,
  SiloRouteConfig,
  Record<string, unknown>,
  ServerApiReferenceInput | undefined
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

export type ServerCreateFetchRouteHandlerOptions =
  CreateFetchRouteHandlerOptions<
    ServerApiReferenceContext,
    ServerApiReferenceRouter
  >;

export type ServerCreateHttpCompletionStoreOptions =
  CreateHttpCompletionStoreOptions;

export type ServerCompletionStore = CompletionStore;
