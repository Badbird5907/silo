# @silo-storage/sdk-core

This package contains framework-agnostic primitives for Silo uploads and callback handling.

## Core Upload API

Use `createSiloCoreFromToken` to:
- prepare uploads through one endpoint (`/api/v1/upload`) by default
- optionally use register + self-sign flow (`/api/v1/upload/register`)
- enable dev streaming mode (`dev: true`)
- configure callback URL behavior for production
- power framework runtimes such as `@silo-storage/sdk-server`

## Upload Strategies

`sdk-core` supports two upload strategies:

| Strategy | Behavior | Recommended |
| --- | --- | --- |
| `server` (default) | Calls `/api/v1/upload` to register + return signed upload URL in one request | Yes, default for most users |
| `self` | Calls `/api/v1/upload/register` then signs URL locally | Advanced/custom signing flows |

Set strategy in core config or per-call (`prepareUpload` / `registerUploadBatch`):

```ts
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

const uploadCore = createSiloCoreFromToken({
  url: process.env.SILO_URL!,
  token: process.env.SILO_TOKEN!,
  cdnHost: process.env.SILO_CDN ?? process.env.NEXT_PUBLIC_SILO_CDN!,
  uploadStrategy: "server", // optional default
  callbackUrl: "https://app.example.com/api/silo/callback",
});

await uploadCore.prepareUpload({
  uploadStrategy: "server",
  file: {
    fileName: "photo.png",
    size: 1234,
  },
});
```

Use `uploadStrategy: "self"` when you need full control over URL signing behavior.  
`self` requires `keyId` and `signingSecret` in core config.

```ts
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

const uploadCore = createSiloCoreFromToken({
  url: process.env.SILO_URL!,
  token: process.env.SILO_TOKEN!,
  cdnHost: process.env.SILO_CDN ?? process.env.NEXT_PUBLIC_SILO_CDN!,
  callbackUrl: "https://app.example.com/api/silo/callback",
});

const prepared = await uploadCore.prepareUpload({
  file: {
    fileName: "photo.png",
    size: 1234,
    mimeType: "image/png",
  },
});

const downloadUrl = await uploadCore.generateDownloadUrl({
  accessKey: "file-access-key",
  isPublic: false,
  fileName: "photo.png",
});
```

`SILO_TOKEN` is a base64url JSON payload with compact keys:

- `v` version
- `ak` apiKey
- `eid` environmentId
- `ss` signingSecret
- `rm` routeMode (`s` = subdomain, `p` = path)
- `ps` projectSlug

The ingest/CDN host is no longer embedded in `SILO_TOKEN`. Provide it via app env
(`SILO_CDN`, or `NEXT_PUBLIC_SILO_CDN` in Next.js) and pass it as `cdnHost`.

## Callback URL

`sdk-core` only accepts absolute callback URLs. Path/origin resolution should be
handled by framework-specific adapters.

## Callback Metadata

`callbackMetadata` is intentionally low-level in `sdk-core`.
If you are building route-based uploads, prefer `@silo-storage/sdk-server`, which
stores internal route dispatch state in `callbackMetadata.__silo` and keeps that
envelope library-owned.

## Dev SSE Consumption

When registering with `dev: true`, `/api/v1/upload/register` returns SSE.
Use `consumeDevRegisterSse(...)` to parse `connected`, `chunk`, `keepalive`, and `error` events.

## Callback Signature Verification

Use `verifyAndParseUploadCallback` to verify callback signatures and parse the callback envelope,
or call `verifyCallbackSignature` directly when you only need signature verification.
The callback must be signed with the requesting API key's signing secret.
