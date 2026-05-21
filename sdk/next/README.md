# @silo-storage/sdk-next

[Read the Docs](https://silo.evanyu.dev/docs/sdk/next)

Next.js App Router adapter for `@silo-storage/sdk-server`.

## What it provides

- `createRouteHandler(...)` with `GET` + `POST`
- register action handling for client uploads
- callback verification/dispatch via `handleUploadCallback`
- completion polling action for client `onComplete`
- `extractRouterConfig(...)` helper for optional SSR hydration

## Example

```ts
import {
  createSiloCoreFromToken,
  parseSiloToken,
} from "@silo-storage/sdk-core";
import { createRouteHandler } from "@silo-storage/sdk-next";

import { fileRouter } from "./core";

const token = process.env.SILO_TOKEN!;
const parsed = parseSiloToken(token);

const core = createSiloCoreFromToken({
  url: process.env.SILO_URL!,
  token,
  cdnHost: process.env.NEXT_PUBLIC_SILO_CDN!,
});

export const { GET, POST } = createRouteHandler({
  router: fileRouter,
  core,
  signingSecret: parsed.signingSecret,
  resolveContext: async (req) => ({
    userId: req.headers.get("x-user-id") ?? "",
  }),
});
```
