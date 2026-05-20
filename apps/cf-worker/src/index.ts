import { Hono } from "hono";

import type { DeletePrefixQueueMessage } from "./services/r2/delete-prefix";
import type { Bindings, Variables } from "./types/bindings";
import { UploadStateDO } from "./durable-objects/upload-state-do";
import { requireCallbackSecret } from "./middleware/auth";
import { cors } from "./middleware/cors";
import { requireDevelopment } from "./middleware/dev-only";
import { methodOverride } from "./middleware/method-override";
import {
  extractProject,
  requireMainDomain,
  requireProject,
} from "./middleware/project";
import { handleDevR2ListAll } from "./routes/dev/r2-list-all";
import { handleDirectUpload } from "./routes/direct-upload";
import { handleDownload } from "./routes/download";
import { handleImage, handleInternalImageSource } from "./routes/image";
import { handleInternalDelete } from "./routes/internal/delete";
import { handleInternalDeletePrefix } from "./routes/internal/delete-prefix";
import { handleInternalList } from "./routes/internal/list";
import { handleInternalMetadata } from "./routes/internal/metadata";
import { handleInternalMultipartAbort } from "./routes/internal/multipart-abort";
import { handleInternalUploadDelete } from "./routes/internal/upload-delete";
import {
  handleUploadCreate,
  handleUploadDelete,
  handleUploadPut,
  handleUploadStatus,
} from "./routes/upload";
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
app.get("/dev/r2/list-all", requireDevelopment, handleDevR2ListAll);
app.options("/ingest/resumable", requireProject, (c) => c.body(null, 204));
app.options("/ingest/resumable/:uploadId", requireProject, (c) =>
  c.body(null, 204),
);
app.post("/ingest/resumable", requireProject, handleUploadCreate);
app.get("/ingest/resumable/:uploadId", requireProject, handleUploadStatus);
app.put("/ingest/resumable/:uploadId", requireProject, handleUploadPut);
app.delete("/ingest/resumable/:uploadId", requireProject, handleUploadDelete);
app.put("/ingest/put", requireProject, handleDirectUpload);
app.get("/f/:accessKey", requireProject, handleDownload);
app.get("/i/:accessKey", requireProject, handleImage);

// Path-mode project routes (e.g. /p/:projectSlug/...)
app.options(
  "/:projectRoutePrefix/:projectSlug/ingest/resumable",
  requireProject,
  (c) => c.body(null, 204),
);
app.options(
  "/:projectRoutePrefix/:projectSlug/ingest/resumable/:uploadId",
  requireProject,
  (c) => c.body(null, 204),
);
app.post(
  "/:projectRoutePrefix/:projectSlug/ingest/resumable",
  requireProject,
  handleUploadCreate,
);
app.get(
  "/:projectRoutePrefix/:projectSlug/ingest/resumable/:uploadId",
  requireProject,
  handleUploadStatus,
);
app.put(
  "/:projectRoutePrefix/:projectSlug/ingest/resumable/:uploadId",
  requireProject,
  handleUploadPut,
);
app.delete(
  "/:projectRoutePrefix/:projectSlug/ingest/resumable/:uploadId",
  requireProject,
  handleUploadDelete,
);
app.put(
  "/:projectRoutePrefix/:projectSlug/ingest/put",
  requireProject,
  handleDirectUpload,
);
app.get(
  "/:projectRoutePrefix/:projectSlug/f/:accessKey",
  requireProject,
  handleDownload,
);
app.get(
  "/:projectRoutePrefix/:projectSlug/i/:accessKey",
  requireProject,
  handleImage,
);

// internal routes
app.delete(
  "/internal/delete/:storageKey{.+}",
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
  "/internal/get-metadata/:storageKey{.+}",
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
  "/internal/uploads/:uploadId/delete",
  requireMainDomain,
  requireCallbackSecret,
  handleInternalUploadDelete,
);
app.get(
  "/internal/image-source/:projectId/:accessKey",
  requireMainDomain,
  requireCallbackSecret,
  handleInternalImageSource,
);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  const isProtocolRequest = c.req.path.includes("/ingest/resumable");
  const response = createErrorResponse(err, isProtocolRequest);

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
    const tasks = [
      { name: "runExpiryCleanup", run: runExpiryCleanup(env) },
      {
        name: "runPendingUploadCleanup",
        run: runPendingUploadCleanup(env),
      },
      { name: "runLifecycleJobs", run: runLifecycleJobs(env) },
    ];

    const results = await Promise.allSettled(tasks.map((task) => task.run));

    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error("Scheduled cleanup task failed", {
          task: tasks[index]?.name,
          error: result.reason as unknown,
        });
      }
    }
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
          console.error("DLQ delete-prefix failure requeued", {
            queue: batch.queue,
            requestId,
            prefix,
            cursor,
            failedAt: new Date().toISOString(),
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                  }
                : String(error),
          });
          message.retry();
          continue;
        }

        message.retry();
      }
    }
  },
};

export { UploadStateDO };
