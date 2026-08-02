# Cloudflare architecture

Silo runs entirely on Cloudflare. `alchemy.run.ts` is the source of truth for infrastructure; generated Wrangler files and hand-managed dashboard configuration are not part of the deployment model.

| Component                                     | Cloudflare service   | Persistent identity                                 |
| --------------------------------------------- | -------------------- | --------------------------------------------------- |
| Control plane (`apps/nextjs`)                 | Workers via OpenNext | `silo-app`                                          |
| Upload/download data plane (`apps/cf-worker`) | Workers              | existing `silo-worker`                              |
| Upload bytes                                  | R2                   | existing `silo-uploads` bucket                      |
| Resumable upload state                        | Durable Objects      | existing `UploadStateDO` namespace on `silo-worker` |
| Completion and development SSE state          | Durable Objects      | `CompletionDurableObject` on `silo-app`             |
| Webhook and callback retries                  | Queues               | `silo-upload-webhooks` plus its DLQ                 |
| PostgreSQL access                             | Hyperdrive           | `silo-postgres`                                     |
| Retention                                     | Cron Trigger         | daily on `silo-app`                                 |
| Upload cleanup and lifecycle processing       | Cron Trigger         | every five minutes on `silo-worker`                 |
| Documentation                                 | Workers via OpenNext | `silo-docs`                                         |

## Data invariants

- Existing `files.storage_key` values are not rewritten. They continue to address the same objects in the adopted `silo-uploads` bucket.
- The production R2 bucket has `delete: false` in Alchemy. Removing the resource from the stack cannot delete production upload data.
- The production ingest Worker is adopted under its existing `silo-worker` name so its Durable Object namespace remains attached to the same script identity.
- PostgreSQL remains the system of record. D1 is deliberately not used because the current schema and jobs depend on PostgreSQL features.
- Queue delivery is at least once. Delivery attempts are claimed in PostgreSQL before an external request and customer requests retain the stable `X-Silo-Webhook-Id` idempotency key.

## Request flow

1. The control plane registers an upload intent in PostgreSQL.
2. The client uploads directly to `silo-worker`, which stores bytes in R2 and state in `UploadStateDO`.
3. The ingest Worker calls the control plane callback to commit the completed upload.
4. The control plane stores short-lived completion state in `CompletionDurableObject` and enqueues webhook/callback retry work in Cloudflare Queues.
5. The control-plane Worker consumes the queue and records every delivery attempt in PostgreSQL.

The synchronous SDK callback is still attempted once during upload completion. The queue handles subsequent retries and the separately configured environment webhook.

## Local development

Run:

```bash
pnpm dev
```

This starts PostgreSQL and runs the Alchemy development stack. Alchemy emulates the Workers, R2, Queue, Durable Objects, and Hyperdrive bindings. OpenNext reads the Alchemy-generated `wrangler.jsonc`; that file is intentionally ignored.

Use `.env.local` for local secrets. Redis and MinIO are no longer required.
