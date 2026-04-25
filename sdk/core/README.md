# @silo-storage/sdk-core

[Read the Docs](https://silo.evanyu.dev/docs/sdk/core)

This package contains framework-agnostic primitives for Silo uploads and callback handling.

It also includes direct file-management helpers for listing, fetching, updating, and deleting files.

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

## URL Generation


```ts
const downloadUrl = await uploadCore.generateDownloadUrl({
  accessKey: "file-access-key",
  isPublic: false,
  fileName: "photo.png",
});

const imageUrl = await uploadCore.generateImageUrl({
  accessKey: "file-access-key",
  isPublic: false,
  serveImage: true,
  fileName: "photo.png",
});

await uploadCore.deleteFile({
  projectId: "proj_123",
  fileKeyId: "filekey_123",
});
```

You can also generate URLs from an access key or file-like object.
Bare access keys default to signed/private-style URLs.

```ts
const signedDownloadUrl =
  await uploadCore.generateDownloadUrl("file-access-key");

const publicDownloadUrl = await uploadCore.generateDownloadUrl(
  "file-access-key",
  { sign: false },
);

const imageFromFile = await uploadCore.generateImageUrl(prepared.file);

const signedImageUrl = await uploadCore.generateImageUrl("file-access-key", {
  width: 800,
});

const publicImageUrl = await uploadCore.generateImageUrl("file-access-key", {
  sign: false,
  width: 800,
});
```

`SILO_TOKEN` is a base64url JSON payload with compact keys:

- `v` version
- `ak` apiKey
- `eid` environmentId
- `ss` signingSecret
- `rm` routeMode (`s` = subdomain, `p` = path)
- `ps` projectSlug
