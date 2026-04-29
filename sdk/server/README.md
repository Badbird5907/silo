# @silo-storage/sdk-server

[Read the Docs](https://silo.evanyu.dev/docs/sdk/server)

Framework-agnostic router runtime for Silo uploads.

This package provides a typed router for defining file routes with validated
input, middleware, upload expectations, and completion callbacks.

## What it provides

- `createSiloUpload()`: define typed file routes with middleware
- `registerRouteUpload(...)` / `prepareRouteUpload(...)`: run middleware and
  register uploads through `@silo-storage/sdk-core`
- internal callback envelope in `callbackMetadata.__silo`
- `handleUploadCallback(...)`: verify callback signatures and dispatch
  `onUploadComplete` handlers
- `createFetchRouteHandler(...)`: shared `Request`/`Response` adapter for
  framework route handlers
- `createHttpCompletionStore(...)`: HTTP-backed completion-store client
- `extractRouterConfig(...)`: safe route config extraction for client hydration

By default, router registration uses core `uploadStrategy: "server"` (combined
`/api/v1/upload` registration + URL signing). You can opt into
`uploadStrategy: "self"` per call when you need local signing behavior.

Registration also supports `uploadMethod: "tus" | "put"`. Leave it as the
default `tus` for resumable uploads, or pass `put` when the client should
receive a direct signed `PUT` URL instead.

## Example

```ts
import type { FileRouter } from "@silo-storage/sdk-server";
import { z } from "zod";

import { createSiloUpload } from "@silo-storage/sdk-server";

type Context = { userId: string };

const f = createSiloUpload<Request, Context>();

export const fileRouter = {
  profilePicture: f(
    z.object({
      folder: z.enum(["avatars", "attachments"]).default("avatars"),
      public: z.boolean().optional(),
      kind: z.enum(["image", "binary"]).default("image"),
    }),
  )
    .middleware(async ({ req, context, input }) => {
      const userId = context.userId ?? req.headers.get("x-user-id");
      if (!userId) throw new Error("Unauthorized");
      return {
        userId,
        folder: input.folder,
        kind: input.kind,
      };
    })
    .expects(({ input }) =>
      input.kind === "binary"
        ? [
            {
              mimeTypes: ["application/xyz", "application/abc"],
              maxFileCount: 4,
              maxFileSize: "16MB",
            },
          ]
        : {
            image: {
              maxFileCount: 2,
              maxFileSize: "8MB",
              mimeTypes: ["image/png", "image/jpeg"],
            },
          },
    )
    .public(({ input }) => input.public ?? false)
    .serveImage(({ input }) => input.folder === "avatars")
    .expires(({ input }) =>
      input.folder === "avatars" ? "30 days" : "7 days",
    )
    .onUploadComplete(async ({ metadata, file, core }) => {
      return {
        uploadedBy: metadata.userId,
        folder: metadata.folder,
        fileId: file.fileId,
        expiresAt: file.expiresAt,
        imageUrl: await core.generateImageUrl(file),
      };
    }),
} satisfies FileRouter;
```

Middleware return values are persisted as file metadata during registration and
are provided back to `onUploadComplete` via the callback event file payload.

The schema you pass to `f(schema)` must implement Standard Schema v1, so Zod
works directly and the parsed output is what middleware, expects resolvers, and
route option resolvers receive as `input`.

## Defining file expectations

Use `.expects(...)` to define what a route can upload.

Object shorthand works well for broad buckets and exact keyed MIME types:

```ts
f()
  .middleware(async ({ context }) => ({ userId: context.userId }))
  .expects({
    image: {
      maxFileCount: 4,
      maxFileSize: "8MB",
      mimeTypes: ["image/png", "image/jpeg"],
    },
    "application/pdf": {
      maxFileCount: 2,
      maxFileSize: "16MB",
    },
  })
```

Array buckets work well when several arbitrary MIME types should share the same
pool:

```ts
f()
  .middleware(async ({ context }) => ({ userId: context.userId }))
  .expects([
    {
      mimeTypes: ["application/xyz", "application/abc"],
      maxFileCount: 4,
      maxFileSize: "16MB",
    },
  ])
```

You can also combine a broad `type` with a narrowed MIME list:

```ts
f()
  .middleware(async ({ context }) => ({ userId: context.userId }))
  .expects([
    {
      type: "image",
      mimeTypes: ["image/png", "image/jpeg"],
      maxFileCount: 4,
      maxFileSize: "8MB",
    },
  ])
```
