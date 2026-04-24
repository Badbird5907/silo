# @silo-storage/sdk-tanstack-start

[Read the Docs](https://silo.evanyu.dev/docs/sdk/tanstack-start)

TanStack Start server-route adapter for `@silo-storage/sdk-server`.

## What it provides

- `createRouteHandler(...)` for TanStack Start `server.handlers`
- register action handling for client uploads
- callback verification and `onUploadComplete` dispatch
- completion polling action for the React client
- `extractRouterConfig(...)` helper for optional client hydration

## Example

```ts
import { createFileRoute } from "@tanstack/react-start";
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";
import { createRouteHandler } from "@silo-storage/sdk-tanstack-start";

import { fileRouter } from "./core";

const core = createSiloCoreFromToken({
  url: process.env.SILO_URL!,
  token: process.env.SILO_TOKEN!,
  cdnHost: process.env.SILO_CDN!,
});

const handlers = createRouteHandler({
  router: fileRouter,
  core,
  resolveContext: async ({ headers }) => ({
    userId: headers.get("x-user-id") ?? "",
  }),
});

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers,
  },
});
```
