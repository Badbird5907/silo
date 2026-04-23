import type { UploadCore, UploadFileInput } from "@silo-storage/sdk-core";
import { z } from "zod";

import { handleUploadCallback } from "./callback-handler";
import { createHttpCompletionStore } from "./http-completion-store";
import type { FileRouter } from "./router";
import { extractRouterConfig, registerRouteUpload } from "./router";

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
      serveImage: z.boolean().optional(),
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
    serveImage: file.serveImage,
  }));
}

export interface CreateFetchRouteHandlerOptions<
  TContext = undefined,
  TRouter extends FileRouter<Request, TContext> = FileRouter<Request, TContext>,
> {
  router: TRouter;
  core: UploadCore;
  resolveContext?: (request: Request) => Promise<TContext> | TContext;
  callbackUrl?: string | ((request: Request) => string | Promise<string>);
  completionTtlMs?: number;
  completionStore?: CompletionStore;
  completionStoreUrl?: string | URL;
  completionStoreAuthToken?: string;
  completionStorePathPrefix?: string;
  completionNamespace?: string;
}

interface FetchRouteHandlers {
  GET(this: void): Response;
  POST(this: void, request: Request): Promise<Response>;
}

export function createFetchRouteHandler<
  TContext = undefined,
  TRouter extends FileRouter<Request, TContext> = FileRouter<Request, TContext>,
>(options: CreateFetchRouteHandlerOptions<TContext, TRouter>): FetchRouteHandlers {
  const completionDebugEnabled =
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.SILO_COMPLETION_DEBUG === "1";
  const logCompletionDebug = (
    event: string,
    details: Record<string, unknown>,
  ) => {
    if (!completionDebugEnabled) return;
    console.info("[silo-completion]", {
      event,
      ...details,
    });
  };

  const completionTtlMs = options.completionTtlMs ?? 10 * 60 * 1000;
  const completionStoreUrl =
    options.completionStoreUrl ?? options.core.config.apiBaseUrl;
  const completionStoreAuthToken =
    options.completionStoreAuthToken ?? options.core.config.apiKey;
  const completionStorePathPrefix =
    options.completionStorePathPrefix ?? "/api/v1/completion";
  const completionNamespace = options.completionNamespace ?? "sdk-route-handler";
  const completionStore =
    options.completionStore ??
    (completionStoreUrl
      ? createHttpCompletionStore({
          baseUrl: completionStoreUrl,
          pathPrefix: completionStorePathPrefix,
          namespace: completionNamespace,
          headers: completionStoreAuthToken
            ? {
                Authorization: `Bearer ${completionStoreAuthToken}`,
              }
            : undefined,
        })
      : new MemoryCompletionStore());

  function GET(this: void) {
    return json({
      routerConfig: extractRouterConfig(options.router),
    });
  }

  async function POST(this: void, request: Request) {
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
        const fileKeyId = callbackResult.event.data.fileKeyId;
        const setStartedAt = Date.now();
        logCompletionDebug("callback.received", {
          fileKeyId,
          routeSlug: callbackResult.routeSlug,
        });
        try {
          await completionStore.set(
            fileKeyId,
            {
              routeSlug: callbackResult.routeSlug,
              fileKeyId,
              completedAt: Date.now(),
              onUploadCompleteResult: callbackResult.onUploadCompleteResult,
            },
            completionTtlMs,
          );
          logCompletionDebug("completion.set.ok", {
            fileKeyId,
            elapsedMs: Date.now() - setStartedAt,
          });
        } catch (error) {
          logCompletionDebug("completion.set.error", {
            fileKeyId,
            elapsedMs: Date.now() - setStartedAt,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      return json({
        ok: true,
        callback: callbackResult,
      });
    }

    const action = await parseActionBody(request);

    if (action.action === "await-completion") {
      const timeoutMs = action.timeoutMs ?? 20_000;
      const waitStartedAt = Date.now();
      logCompletionDebug("completion.wait.start", {
        fileKeyId: action.fileKeyId,
        timeoutMs,
      });
      let completion: CompletionEntry | null = null;
      try {
        completion = await completionStore.wait(action.fileKeyId, timeoutMs);
      } catch (error) {
        logCompletionDebug("completion.wait.error", {
          fileKeyId: action.fileKeyId,
          timeoutMs,
          elapsedMs: Date.now() - waitStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      logCompletionDebug("completion.wait.done", {
        fileKeyId: action.fileKeyId,
        timeoutMs,
        elapsedMs: Date.now() - waitStartedAt,
        found: Boolean(completion),
      });
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
              "SDK route handler does not proxy development SSE registration streams yet.",
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
        serveImage: file.serveImage,
        expiresAt: file.expiresAt,
      })),
    });
  }

  return {
    GET,
    POST,
  };
}
