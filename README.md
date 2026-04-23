# Silo

Silo is an open-source file storage and upload system built for the modern web.
It pairs a Cloudflare Worker and R2-backed upload service with typed SDKs for server and client apps, so you can add resumable uploads without relying on the browser to report completion correctly.

Instead of the usual "presigned URL, then hope the client tells your app it finished" flow, Silo treats upload completion as a server-owned event. Files are uploaded with the TUS protocol for resumability, and Silo sends a signed callback back to your application when the upload actually completes.

## Why Silo 

- Resumable uploads via TUS
- Server-verified completion callbacks
- Cloudflare R2 and Workers as the storage/runtime layer
- Typed SDK packages for framework and client integrations
- Support for signed/private file access and image delivery workflows

## What's In This Repo

This repository is a pnpm/turborepo monorepo containing the full Silo stack:

- `apps/cf-worker`: the Cloudflare Worker that handles uploads and storage operations
- `apps/nextjs`: the web app and local/self-hosted control surface
- `apps/docs`: the documentation site
- `sdk/*`: publishable SDK packages for core, server, React, Next.js, and TanStack Start integrations
- `packages/*`: shared workspace packages used across the apps and SDKs

## Get Started

If you want to use Silo in an application, start with the SDK docs:

- [Introduction](https://silo.evanyu.dev/docs)
- [SDK overview](https://silo.evanyu.dev/docs/sdk)
- [Next.js adapter](https://silo.evanyu.dev/docs/sdk/next)
- [Server SDK](https://silo.evanyu.dev/docs/sdk/server)
- [React SDK](https://silo.evanyu.dev/docs/sdk/react)

If you want to run the full platform yourself, follow the [deployment guide](https://silo.evanyu.dev/docs/deploy).

## Local Development

Silo targets:

- Node.js `^24.15.0`
- pnpm `^10.19.0`

Install dependencies from the repo root:

```bash
pnpm install
```

Common commands:

```bash
pnpm dev
pnpm dev:next
pnpm dev:worker
pnpm --filter @silo-storage/docs dev
```

## Documentation

The docs source lives in `apps/docs/content/docs`.
If you prefer browsing the docs app locally, run:

```bash
pnpm --filter @silo-storage/docs dev
```
