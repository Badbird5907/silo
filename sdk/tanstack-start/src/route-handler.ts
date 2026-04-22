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

interface TanStackStartHandlerArgs {
  request: Request;
  params?: Record<string, string>;
}

export type CreateRouteHandlerOptions<
  TContext = undefined,
  TRouter extends FileRouter<Request, TContext> = FileRouter<Request, TContext>,
> = CreateFetchRouteHandlerOptions<TContext, TRouter>;

export { extractRouterConfig, type CompletionEntry, type CompletionStore };

export function createRouteHandler<
  TContext = undefined,
  TRouter extends FileRouter<Request, TContext> = FileRouter<Request, TContext>,
>(options: CreateRouteHandlerOptions<TContext, TRouter>) {
  const handler = createFetchRouteHandler(options);

  return {
    GET(_args: TanStackStartHandlerArgs) {
      return handler.GET();
    },
    POST(args: TanStackStartHandlerArgs) {
      return handler.POST(args.request);
    },
  };
}
