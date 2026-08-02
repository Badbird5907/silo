# Production migration: Vercel to Cloudflare

This runbook assumes uploads can be paused during the final cutover. Existing completed uploads remain in PostgreSQL and R2; they are not copied or backfilled.

## 1. Prepare credentials and configuration

Create a Cloudflare API token that can manage Workers, custom domains/routes, R2, Queues, Durable Objects, Hyperdrive, and Cron Triggers. Export the Cloudflare account/token variables expected by Alchemy, plus an encryption password:

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
export ALCHEMY_PASSWORD=...
```

Persist `.alchemy/production` as an encrypted deployment artifact between production runs. It is ignored by Git because it contains deployment state; `ALCHEMY_PASSWORD` is required to read its encrypted secrets. Production resources also use stable names plus adoption so a lost state artifact can be recovered deliberately.

Set the application values in the deployment environment:

- `APP_DOMAIN`, `DOCS_DOMAIN`, `WORKER_DOMAIN`
- `APP_URL`, `WORKER_URL`, `NEXT_PUBLIC_SILO_CDN`
- `POSTGRES_URL_DIRECT` for Hyperdrive and `POSTGRES_URL` for migrations/tools
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- `CALLBACK_SECRET`, `SIGNING_SECRET`
- `SILO_URL` and `SILO_TOKEN` for the documentation SDK demo
- optional Clerk and Better Auth variables

Keep the current production names unless intentionally migrating data: `silo-worker` and `silo-uploads` are adoption identities.

## 2. Back up and establish the baseline

Take a PostgreSQL backup and record the current R2 object count/bytes from Cloudflare analytics. Do not bulk-copy R2 and do not update historical `storage_key` values.

Run the database gate:

```bash
pnpm migration:audit
```

The first run may fail because pending uploads or lifecycle jobs still exist. That is expected before the drain.

## 3. Deploy Cloudflare without moving production domains

Leave `ATTACH_PRODUCTION_DOMAINS` unset and deploy the production stage:

```bash
pnpm infra:deploy -- --stage production
```

Alchemy adopts the existing upload Worker and R2 bucket, then creates the OpenNext Workers, Hyperdrive, webhook Queue/DLQ, and completion Durable Object. Production resources containing upload data are configured not to be deleted by an Alchemy destroy.

Test the generated `workers.dev` URLs:

- control-plane health/login and read-only dashboard paths
- ingest `/health`
- a non-production project upload, download, callback, and webhook
- retention and ingest scheduled handlers in a non-production Alchemy stage

Do not enable both the Vercel queue consumer and Cloudflare queue producer for the same new event stream.

## 4. Pause and drain

1. Set `UPLOADS_ENABLED=false` on the current production control plane or otherwise block upload registration. Existing object downloads can remain available.
2. Confirm clients are no longer receiving new upload URLs.
3. Leave the existing ingest Worker and its five-minute cron running. It must finish callbacks for R2 objects that completed while their database rows were still pending.
4. Drain the Vercel `upload-webhooks` queue to zero. Vercel queue payloads are not represented by historical upload rows and must not be recreated by scanning the database.
5. Let lifecycle jobs run until no jobs are `pending`, `leased`, or `retry`.
6. Re-run `pnpm migration:audit` until it exits successfully.

Do not mark pending rows failed merely because the database still says `pending`. First allow the old `UploadStateDO`/R2 callback path to reconcile objects that already completed. The hard cutover gate is zero pending uploads after that reconciliation.

The count of completed uploads can be large. That is informational and does not block the migration. Only completed rows missing a `files.storage_key` block cutover.

## 5. Cut over domains

Deploy again with domains enabled and uploads still paused:

```bash
export ATTACH_PRODUCTION_DOMAINS=true
export UPLOADS_ENABLED=false
pnpm infra:deploy -- --stage production
```

Alchemy transfers the configured custom domains to the Cloudflare Workers. Verify:

```text
GET https://<WORKER_DOMAIN>/health
GET https://<APP_DOMAIN>/
GET https://<DOCS_DOMAIN>/
```

Check authentication, dashboard reads, existing-file downloads, signed URLs, and an internal callback authorization failure/success path.

## 6. Resume and observe

Set `UPLOADS_ENABLED=true` and deploy once more. Perform one upload in each environment type and verify:

- the database row moves from `pending` to `completed`
- the R2 object uses the expected existing bucket/key convention
- completion wait returns successfully
- environment webhooks and SDK callbacks are delivered
- retries appear in `webhook_attempts`/`callback_attempts`
- failed retries reach `silo-upload-webhooks-dlq`

Watch Worker errors, Queue backlog, Hyperdrive connection errors, callback latency, pending upload count, and lifecycle job states for at least one normal upload-expiration window.

## 7. Decommission Vercel

After the observation window:

1. Disable the Vercel cron and queue consumer.
2. Remove Vercel project environment variables and domain assignments.
3. Delete the Vercel deployment/project only after rollback is no longer required.
4. Remove any remaining Upstash Redis project previously used only by Silo completion/SSE state.

## Rollback

Before resuming uploads, rollback is a domain reassignment to the frozen Vercel deployment. Do not roll back the adopted R2 bucket or ingest Durable Object namespace.

After Cloudflare has accepted new uploads, prefer fixing forward. A rollback must keep the Cloudflare ingest Worker and queue consumer running long enough to finish callbacks and retry messages created during the Cloudflare window; otherwise those payloads are stranded.
