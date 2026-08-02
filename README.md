# Silo

Silo is an open-source file storage and upload system built for the modern web.
It's built on top of Cloudflare's R2 and Workers, and includes typed SDKs for server and client apps, so you can add resumable uploads without relying on the browser to report completion correctly.

Instead of the usual "presigned URL, then hope the client tells your app it finished" flow, Silo treats upload completion as a server-owned event. Files are uploaded with the TUS protocol for resumability, and Silo sends a signed callback back to your application when the upload actually completes.

[Read the Docs!](https://silo.evanyu.dev/docs)

## Why Silo

- Resumable uploads via [TUS](https://tus.io/)
- Server-verified completion callbacks
- Cloudflare R2 and Workers as the storage/runtime layer
- Fully-typed SDK packages for framework and client integrations
- Easy to use (optional) TRPC-esque router API for server side file routing
- Support for signed/private file ACLs
- Support for image transformations and delivery

## Easy to use SDK

```ts
const f = createSiloUpload<Request, UploadContext>();

export const fileRouter = {
  imageUploader: f()
    .middleware(async ({ context }) => {
      return { userId: context.userId };
    })
    .expects({
      image: {
        maxFileSize: "8MB",
        maxFileCount: 4,
        mimeTypes: ["image/png", "image/jpeg"],
      },
    })
    .expires("30 minutes") // delete after 30 minutes
    .public(false) // do we need a signed url to access?
    .serveImage(true) // serve images from the image CDN (transformations etc)
    .onUploadComplete(async ({ file, core, metadata }) => {
      return {
        uploadedBy: metadata.userId,
        fileKeyId: file.fileKeyId,
        expiresAt: file.expiresAt,
        url: await core.generateImageUrl(file.accessKey),
        test: "hello",
      };
    }),
} satisfies FileRouter<Request, UploadContext>;
```

## What's In This Repo

This repository is a pnpm/turborepo monorepo containing the full Silo stack:

- `apps/cf-worker`: the Cloudflare upload/download Worker backed by R2
- `apps/nextjs`: the OpenNext control-plane Worker on Cloudflare
- `apps/docs`: the OpenNext documentation Worker on Cloudflare
- `sdk/*`: SDK packages for core, server, React, Next.js, and TanStack Start integrations
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
pnpm infra:plan -- --stage staging
pnpm infra:deploy -- --stage staging
```

Infrastructure details live in [`docs/architecture/cloudflare.md`](docs/architecture/cloudflare.md). Production migration and rollback instructions are in [`docs/migrations/vercel-to-cloudflare.md`](docs/migrations/vercel-to-cloudflare.md).

## Documentation

The docs source lives in `apps/docs/content/docs`.
If you prefer browsing the docs app locally, run:

```bash
pnpm --filter @silo-storage/docs dev
```
