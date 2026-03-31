import type { UploadCore, UploadFileInput } from "@silo-storage/sdk-core";
import type { FileRouter, RouterConfig } from "@silo-storage/sdk-server";
import { z } from "zod";

import { createHttpCompletionStore } from "./http-completion-store";

import {
  extractRouterConfig as extractRouterConfigFromServer,
  handleUploadCallback,
  registerRouteUpload,
} from "@silo-storage/sdk-server";

const registerRequestSchema = z.object({
  action: z.literal("register"),
  endpoint: z.string().min(1),
  input: z.unknown().optional(),
  expiresIn: z.number().int().positive().optional(),
  protocol: z.enum(["http", "https"]).optional(),
  files: z
    .object({
      fileName: z.string().min(1),
      size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      mimeType: z.string().optional(),
      hash: z.string().optional(),
      isPublic: z.boolean().optional(),
    })
    .array()
    .min(1),
});

const awaitCompletionSchema = z.object({
  action: z.literal("await-completion"),
  fileKeyId: z.string().min(1),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

type RouteActionRequest =
  | z.infer<typeof registerRequestSchema>
  | z.infer<typeof awaitCompletionSchema>;

export interface CompletionEntry {
  routeSlug: string;
  fileKeyId: string;
  completedAt: number;
  onUploadCompleteResult: unknown;
}

export interface CompletionStore {
  set(fileKeyId: string, value: CompletionEntry, ttlMs: number): Promise<void>;
  get(fileKeyId: string): Promise<CompletionEntry | null>;
  wait(fileKeyId: string, timeoutMs: number): Promise<CompletionEntry | null>;
}

class MemoryCompletionStore implements CompletionStore {
  private readonly completionByFileKey = new Map<
    string,
    CompletionEntry & { expiresAt: number }
  >();

  set(
    fileKeyId: string,
    value: CompletionEntry,
    ttlMs: number,
  ): Promise<void> {
    this.completionByFileKey.set(fileKeyId, {
      ...value,
      expiresAt: Date.now() + Math.max(1, ttlMs),
    });
    return Promise.resolve();
  }

  get(fileKeyId: string): Promise<CompletionEntry | null> {
    const entry = this.completionByFileKey.get(fileKeyId);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt <= Date.now()) {
      this.completionByFileKey.delete(fileKeyId);
      return Promise.resolve(null);
    }
    return Promise.resolve({
      routeSlug: entry.routeSlug,
      fileKeyId: entry.fileKeyId,
      completedAt: entry.completedAt,
      onUploadCompleteResult: entry.onUploadCompleteResult,
    });
  }

  async wait(fileKeyId: string, timeoutMs: number): Promise<CompletionEntry | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const found = await this.get(fileKeyId);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function isCallbackRequest(request: Request): boolean {
  return !!request.headers.get("x-silo-signature");
}

async function parseActionBody(request: Request): Promise<RouteActionRequest> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new Error("Invalid JSON body");
  }

  const registerResult = registerRequestSchema.safeParse(body);
  if (registerResult.success) return registerResult.data;

  const awaitResult = awaitCompletionSchema.safeParse(body);
  if (awaitResult.success) return awaitResult.data;

  throw new Error("Unsupported action payload");
}

function resolveCallbackUrl(
  request: Request,
  callbackUrl?: string | ((request: Request) => string | Promise<string>),
): Promise<string> {
  if (typeof callbackUrl === "function") {
    return Promise.resolve(callbackUrl(request));
  }
  if (typeof callbackUrl === "string") {
    return Promise.resolve(callbackUrl);
  }
  return Promise.resolve(new URL(request.url).toString());
}

function toUploadFiles(
  files: z.infer<typeof registerRequestSchema>["files"],
): UploadFileInput[] {
  return files.map((file) => ({
    fileName: file.fileName,
    size: file.size,
    mimeType: file.mimeType,
    hash: file.hash,
    isPublic: file.isPublic,
  }));
}

export interface CreateRouteHandlerOptions<
  TContext = undefined,
  TRouter extends FileRouter<Request, TContext> = FileRouter<Request, TContext>,
> {
  router: TRouter;
  core: UploadCore;
  // signingSecret: string;
  resolveContext?: (request: Request) => Promise<TContext> | TContext;
  callbackUrl?: string | ((request: Request) => string | Promise<string>);
  completionTtlMs?: number;
  completionStore?: CompletionStore;
  completionStoreUrl?: string | URL;
  completionStoreAuthToken?: string;
  completionStorePathPrefix?: string;
}

export function extractRouterConfig<TRouter extends Record<string, unknown>>(
  router: TRouter,
): RouterConfig<TRouter> {
  return extractRouterConfigFromServer(router);
}

export function createRouteHandler<
  TContext = undefined,
  TRouter extends FileRouter<Request, TContext> = FileRouter<Request, TContext>,
>(options: CreateRouteHandlerOptions<TContext, TRouter>) {
  const completionTtlMs = options.completionTtlMs ?? 10 * 60 * 1000;
  const completionStore =
    options.completionStore ??
    (options.completionStoreUrl
      ? createHttpCompletionStore({
          baseUrl: options.completionStoreUrl,
          pathPrefix: options.completionStorePathPrefix,
          headers: options.completionStoreAuthToken
            ? {
                Authorization: `Bearer ${options.completionStoreAuthToken}`,
              }
            : undefined,
        })
      : new MemoryCompletionStore());

  function GET() {
    return json({
      routerConfig: extractRouterConfig(options.router),
    });
  }

  async function POST(request: Request) {
    const context = options.resolveContext
      ? await options.resolveContext(request)
      : undefined;

    if (isCallbackRequest(request)) {
      const signingSecret = options.core.config.signingSecret;
      if (!signingSecret) {
        throw new Error(
          "Missing signingSecret for callback verification. Provide signingSecret when creating the core client.",
        );
      }

      const callbackResult = await handleUploadCallback<
        Request,
        Awaited<TContext>,
        TRouter
      >({
        router: options.router,
        request,
        signingSecret,
        context,
      });

      if (callbackResult.status === "handled") {
        await completionStore.set(callbackResult.event.data.fileKeyId, {
          routeSlug: callbackResult.routeSlug,
          fileKeyId: callbackResult.event.data.fileKeyId,
          completedAt: Date.now(),
          onUploadCompleteResult: callbackResult.onUploadCompleteResult,
        }, completionTtlMs);
      }

      return json({
        ok: true,
        callback: callbackResult,
      });
    }

    const action = await parseActionBody(request);

    if (action.action === "await-completion") {
      const timeoutMs = action.timeoutMs ?? 20_000;
      const completion = await completionStore.wait(action.fileKeyId, timeoutMs);
      if (!completion) {
        return json(
          {
            ok: false,
            pending: true,
          },
          202,
        );
      }

      return json({
        ok: true,
        completion,
      });
    }

    if (!(action.endpoint in options.router)) {
      throw new Error(`Unknown route endpoint "${action.endpoint}"`);
    }
    const routeSlug = action.endpoint as keyof TRouter & string;
    const callbackUrl = await resolveCallbackUrl(request, options.callbackUrl);

    
    const registerResult = await registerRouteUpload({
      core: options.core,
      router: options.router,
      routeSlug,
      req: request,
      context,
      input: action.input as never,
      expiresIn: action.expiresIn,
      protocol: action.protocol,
      callbackUrl,
      files: toUploadFiles(action.files),
    });

    if (registerResult.registerResult.mode === "development") {
      return json(
        {
          ok: false,
          error: {
            code: "DEV_STREAM_UNSUPPORTED",
            message:
              "SDK Next route handler does not proxy development SSE registration streams yet.",
          },
        },
        501,
      );
    }

    return json({
      ok: true,
      endpoint: routeSlug,
      files: registerResult.registerResult.files.map((file) => ({
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
        uploadUrl: file.uploadUrl,
        fileName: file.fileName,
        size: file.size,
        hash: file.hash,
        mimeType: file.mimeType,
        isPublic: file.isPublic,
        expiresAt: file.expiresAt,
      })),
    });
  }

  return {
    GET,
    POST,
  };
}
