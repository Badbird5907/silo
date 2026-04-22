import type { UploadCore } from "@silo-storage/sdk-core";
import type { FileRouter } from "@silo-storage/sdk-server";

import { createRouteHandler } from "./route-handler";

interface ExampleUploadContext {
  userId: string;
}

interface StartRouteHandlers {
  GET(args: { request: Request }): Response | Promise<Response>;
  POST(args: { request: Request }): Response | Promise<Response>;
}

declare const core: UploadCore;
declare const router: FileRouter<Request, ExampleUploadContext>;

const handlers = createRouteHandler<ExampleUploadContext>({
  router,
  core,
});

const tanStackStartHandlers: StartRouteHandlers = handlers;

void tanStackStartHandlers;
