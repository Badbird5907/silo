import type {
  CompletionEntry,
  CompletionStore,
  CreateFetchRouteHandlerOptions,
  FileRouter,
} from "@silo-storage/sdk-server";
import {
  createFetchRouteHandler,
  extractRouterConfig,
} from "@silo-storage/sdk-server";

export type CreateRouteHandlerOptions<
  TContext = undefined,
  TRouter extends FileRouter<Request, TContext> = FileRouter<Request, TContext>,
> = CreateFetchRouteHandlerOptions<TContext, TRouter>;

interface NextRouteHandlers {
  GET(this: void): Response;
  POST(this: void, request: Request): Promise<Response>;
}

export { extractRouterConfig, type CompletionEntry, type CompletionStore };

export function createRouteHandler<
  TContext = undefined,
  TRouter extends FileRouter<Request, TContext> = FileRouter<Request, TContext>,
>(options: CreateRouteHandlerOptions<TContext, TRouter>): NextRouteHandlers {
  return createFetchRouteHandler(options);
}
