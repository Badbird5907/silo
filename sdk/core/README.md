# @silo-storage/sdk-core

This package contains framework-agnostic primitives for Silo uploads and callback handling.

## Core Upload API

Use `createSiloCoreFromToken` to:
- generate signed upload URLs (via `@silo-storage/shared`)
- register file intents with `/api/v1/upload/register`
- enable dev streaming mode (`dev: true`)
- configure callback URL behavior for production
- power framework runtimes such as `@silo-storage/sdk-server`

```ts
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

const uploadCore = createSiloCoreFromToken({
  url: process.env.SILO_URL!,
  token: process.env.SILO_TOKEN!,
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
- `is` ingestServer
- `ss` signingSecret
- `rm` routeMode (`s` = subdomain, `p` = path)
- `ps` projectSlug

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
