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
import type { SiloRouteBuilder } from "./router/types";

/**
 * Generic parameters for `createSiloUpload<TRequest, TContext>()`.
 */
export interface ServerCreateSiloUploadGenerics {
  /**
   * Request type passed into middleware and registration helpers.
   *
   * @default Request
   */
  TRequest: Request;

  /**
   * Server-resolved context shared with middleware, expects resolvers,
   * route option resolvers, and callbacks.
   *
   * @default Record<string, never>
   */
  TContext: Record<string, never>;
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
