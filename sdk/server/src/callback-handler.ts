import { verifyAndParseUploadCallback } from "@silo-storage/sdk-core";
import { z } from "zod";

import {
  getUserVisibleCallbackMetadata,
  readInternalCallbackEnvelope,
} from "./envelope";
import type { FileRouter } from "./router";

const uploadEventEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  version: z.literal(1),
  occurredAt: z.string(),
  data: z.unknown(),
});

const uploadCompletedEventDataSchema = z.object({
  environmentId: z.string(),
  projectId: z.string(),
  fileKeyId: z.string(),
  accessKey: z.string(),
  fileId: z.string(),
  fileName: z.string(),
  hash: z.string().nullable(),
  mimeType: z.string(),
  size: z.number(),
  metadata: z.record(z.string(), z.unknown()),
});

const uploadCompletedEventSchema = uploadEventEnvelopeSchema.extend({
  type: z.literal("upload.completed"),
  data: uploadCompletedEventDataSchema,
});

export interface HandleUploadCallbackInput<
  TRouter extends FileRouter<unknown, TContext>,
  TContext = Record<string, never>,
> {
  router: TRouter;
  request:
    | Request
    | {
        headers: Headers | Record<string, string | undefined>;
        body: string;
      };
  signingSecret: string;
  maxAgeSeconds?: number;
  context?: TContext;
}

export type HandleUploadCallbackResult<
  TRouter extends FileRouter<unknown, TContext>,
  TContext = Record<string, never>,
> =
  | {
      status: "ignored";
      reason: "unsupported_event";
      eventType: string;
    }
  | {
      status: "handled";
      routeSlug: keyof TRouter & string;
      eventType: "upload.completed";
      event: z.infer<typeof uploadCompletedEventSchema>;
      middlewareData: Record<string, unknown>;
      callbackMetadata: Record<string, unknown>;
      onUploadCompleteResult: unknown;
    };

export async function handleUploadCallback<
  TRouter extends FileRouter<unknown, TContext>,
  TContext = Record<string, never>,
>(
  input: HandleUploadCallbackInput<TRouter, TContext>,
): Promise<HandleUploadCallbackResult<TRouter, TContext>> {
  const resolvedContext = (input.context ?? {}) as TContext;

  const envelope = await verifyAndParseUploadCallback({
    request: input.request,
    signingSecret: input.signingSecret,
    maxAgeSeconds: input.maxAgeSeconds,
  });

  const internalEnvelope = readInternalCallbackEnvelope(envelope.metadata);
  const parsedEvent = uploadEventEnvelopeSchema.safeParse(envelope.data);
  if (!parsedEvent.success) {
    throw new Error(`Invalid upload callback event payload: ${parsedEvent.error.message}`);
  }

  if (parsedEvent.data.type !== "upload.completed") {
    return {
      status: "ignored",
      reason: "unsupported_event",
      eventType: parsedEvent.data.type,
    };
  }

  const completedEvent = uploadCompletedEventSchema.safeParse(parsedEvent.data);
  if (!completedEvent.success) {
    throw new Error(
      `Invalid upload.completed callback event payload: ${completedEvent.error.message}`,
    );
  }

  const routeSlug = internalEnvelope.routeSlug as keyof TRouter & string;
  const route = input.router[routeSlug];
  if (!route) {
    throw new Error(`No route found for slug "${routeSlug}"`);
  }

  const onUploadCompleteResult = await route.onUploadComplete({
    metadata: internalEnvelope.middlewareData,
    context: resolvedContext,
    file: completedEvent.data.data,
    event: completedEvent.data,
  });

  return {
    status: "handled",
    routeSlug,
    eventType: "upload.completed",
    event: completedEvent.data,
    middlewareData: internalEnvelope.middlewareData,
    callbackMetadata: getUserVisibleCallbackMetadata(envelope.metadata),
    onUploadCompleteResult,
  };
}
