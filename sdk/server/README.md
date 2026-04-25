# @silo-storage/sdk-server

[Read the Docs](https://silo.evanyu.dev/docs/sdk/server)

Framework-agnostic router runtime for Silo uploads.

This package, inspired by the UploadThing SDK, provides a
framework-agnostic router for defining typed file routes with middleware.

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

## Example

```ts
import type { FileRouter } from "@silo-storage/sdk-server";
import { z } from "zod";

import { createSiloUpload } from "@silo-storage/sdk-server";

type Context = { userId: string };

const f = createSiloUpload<Request, Context>();

export const fileRouter = {
  profilePicture: f(["image"])
    .input(
      z.object({
        folder: z.enum(["avatars", "attachments"]).default("avatars"),
        public: z.boolean().optional(),
      }),
    )
    .public(({ input }) => input.public ?? false)
    .serveImage(({ input }) => input.folder === "avatars")
    .middleware(async ({ req, context, input }) => {
      const userId = context?.userId ?? req.headers.get("x-user-id");
      if (!userId) throw new Error("Unauthorized");
      return {
        userId,
        folder: input.folder,
      };
    })
    .onUploadComplete(async ({ metadata, file, core }) => {
      return {
        uploadedBy: metadata.userId,
        folder: metadata.folder,
        fileId: file.fileId,
        imageUrl: await core.generateImageUrl(file),
      };
    }),
  mediaPost: f({
    image: { maxFileSize: "2MB", maxFileCount: 4 },
    video: { maxFileSize: "256MB", maxFileCount: 1 },
  })
    .input(
      z.object({
        kind: z.enum(["image", "video"]).default("image"),
      }),
    )
    .mimeTypes(({ input }) =>
      input.kind === "video" ? ["video"] : ["image/jpeg", "image/png"]
    )
    .middleware(async ({ req, context, input }) => {
      const userId = context?.userId ?? req.headers.get("x-user-id");
      if (!userId) throw new Error("Unauthorized");
      return { userId, kind: input.kind };
    })
    .onUploadComplete(async ({ metadata, file, core }) => {
      return {
        uploadedBy: metadata.userId,
        kind: metadata.kind,
        fileId: file.fileId,
        imageUrl: await core.generateImageUrl(file),
      };
    }),
} satisfies FileRouter;
```

Middleware return values are persisted as file metadata during registration and
are provided back to `onUploadComplete` via the callback event file payload.

Use `.input(schema)` when a specific route needs validated input. The schema must
implement Standard Schema v1, so Zod works directly and the parsed output is
what middleware and option resolvers receive as `input`.

`mimeTypes(...)` accepts all of these forms:

- `.mimeTypes("image")`
- `.mimeTypes(["video", "image/jpeg"])`
- `.mimeTypes(async ({ context, input }) => (input?.kind === "video" ? "video" : ["image", "application/pdf"]))`
