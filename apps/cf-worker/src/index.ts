import { Hono } from "hono";

import type { DeletePrefixQueueMessage } from "./services/r2/delete-prefix";
import type { Bindings, Variables } from "./types/bindings";
import { TusStateDO } from "./durable-objects/tus-state-do";
import { requireCallbackSecret } from "./middleware/auth";
import { cors } from "./middleware/cors";
import { methodOverride } from "./middleware/method-override";
import {
  extractProject,
  requireMainDomain,
  requireProject,
} from "./middleware/project";
import { handleDownload } from "./routes/download";
import { handleDevR2ListAll } from "./routes/dev/r2-list-all";
import { handleInternalDelete } from "./routes/internal/delete";
import { handleInternalDeletePrefix } from "./routes/internal/delete-prefix";
import { handleInternalList } from "./routes/internal/list";
import { handleInternalMetadata } from "./routes/internal/metadata";
import { handleInternalMultipartAbort } from "./routes/internal/multipart-abort";
import { handleInternalTusDelete } from "./routes/internal/tus-delete";
import {
  handleTusCreate,
  handleTusDelete,
  handleTusHead,
  handleTusOptions,
  handleTusPatch,
} from "./routes/tus-handlers";
import { runExpiryCleanup } from "./services/expiry-cleanup";
import { runLifecycleJobs } from "./services/lifecycle-job-runner";
import { runPendingUploadCleanup } from "./services/pending-upload-cleanup";
import { deletePrefixChunk } from "./services/r2/delete-prefix";
import { createErrorResponse } from "./utils/errors";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", cors);
app.use("*", methodOverride);
app.use("*", extractProject);

app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0" }));
app.get("/dev/r2/list-all", handleDevR2ListAll);

app.options("/ingest/tus", requireProject, handleTusOptions);
app.options("/ingest/tus/:uploadId", requireProject, handleTusOptions);
app.post("/ingest/tus", requireProject, handleTusCreate);
// Some runtimes/proxies can normalize HEAD to GET before Hono routing.
// Mirror HEAD handling on GET so resumable uploads do not restart on 404.
app.get("/ingest/tus/:uploadId", requireProject, handleTusHead);
app.on("HEAD", "/ingest/tus/:uploadId", requireProject, handleTusHead);
app.patch("/ingest/tus/:uploadId", requireProject, handleTusPatch);
app.delete("/ingest/tus/:uploadId", requireProject, handleTusDelete);

app.get("/f/:accessKey", requireProject, handleDownload);

// internal routes
app.delete(
  "/internal/delete/*",
  requireMainDomain,
  requireCallbackSecret,
  handleInternalDelete,
);
app.post(
  "/internal/delete-prefix",
  requireMainDomain,
  requireCallbackSecret,
  handleInternalDeletePrefix,
);
app.post(
  "/internal/list",
  requireMainDomain,
  requireCallbackSecret,
  handleInternalList,
);
app.post(
  "/internal/get-metadata/:storageKey",
  requireMainDomain,
  requireCallbackSecret,
  handleInternalMetadata,
);
app.post(
  "/internal/multipart/abort",
  requireMainDomain,
  requireCallbackSecret,
  handleInternalMultipartAbort,
);
app.post(
  "/internal/tus/:uploadId/delete",
  requireMainDomain,
  requireCallbackSecret,
  handleInternalTusDelete,
);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  const response = createErrorResponse(err);

  // TUS spec requires Cache-Control: no-store on all HEAD responses
  if (c.req.method === "HEAD") {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  }

  return response;
});

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Bindings,
  ): Promise<void> {
    await runExpiryCleanup(env);
    await runPendingUploadCleanup(env);
    await runLifecycleJobs(env);
  },
  async queue(
    batch: MessageBatch<DeletePrefixQueueMessage>,
    env: Bindings,
  ): Promise<void> {
    const isDlqBatch = batch.queue === "silo-delete-prefix-dlq";

    for (const message of batch.messages) {
      const { prefix, cursor, requestId } = message.body;

      if (!prefix) {
        console.error("Invalid delete-prefix queue payload: missing prefix", {
          requestId,
        });
        message.ack();
        continue;
      }

      try {
        const result = await deletePrefixChunk({
          prefix,
          cursor,
          env,
        });

        console.info("Processed delete-prefix chunk", {
          queue: batch.queue,
          requestId,
          prefix,
          processed: result.processed,
          deleted: result.deleted,
          truncated: result.truncated,
          cursor: result.cursor,
        });

        if (result.truncated && result.cursor) {
          await env.DELETE_PREFIX_QUEUE.send({
            ...message.body,
            cursor: result.cursor,
          });
        }

        message.ack();
      } catch (error) {
        console.error("Delete-prefix queue message failed", {
          queue: batch.queue,
          requestId,
          prefix,
          cursor,
          error,
        });

        if (isDlqBatch) {
          message.ack();
          continue;
        }

        message.retry();
      }
    }
  },
};

export { TusStateDO };
