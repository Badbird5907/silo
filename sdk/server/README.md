# @silo-storage/sdk-server

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
- `extractRouterConfig(...)`: safe route config extraction for client hydration

## Example

```ts
import type { FileRouter } from "@silo-storage/sdk-server";

import { createSiloUpload } from "@silo-storage/sdk-server";

type Context = { userId: string };

const f = createSiloUpload<Request, Context>();

export const fileRouter = {
  profilePicture: f(["image"])
    .middleware(async ({ req, context, input }) => {
      const userId = context?.userId ?? req.headers.get("x-user-id");
      if (!userId) throw new Error("Unauthorized");
      return { userId, input };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, fileId: file.fileId };
    }),
  mediaPost: f({
    image: { maxFileSize: "2MB", maxFileCount: 4 },
    video: { maxFileSize: "256MB", maxFileCount: 1 },
  })
    .mimeTypes(["image", "video"])
    .middleware(async ({ req, context, input }) => {
      const userId = context?.userId ?? req.headers.get("x-user-id");
      if (!userId) throw new Error("Unauthorized");
      return { userId, input };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, fileId: file.fileId };
    }),
} satisfies FileRouter;
```

Middleware return values are persisted as file metadata during registration and
are provided back to `onUploadComplete` via the callback event file payload.

`mimeTypes(...)` accepts all of these forms:

- `.mimeTypes("image")`
- `.mimeTypes(["video", "image/jpeg"])`
- `.mimeTypes(async ({ context }) => (context ? "blob" : ["image", "application/pdf"]))`
