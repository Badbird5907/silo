"use client";

import { createSiloReact } from "@silo-storage/sdk-react";

import type { AppFileRouter } from "@/lib/sdk-demo/file-router";

export const { useUpload, SiloRouterConfigProvider } = createSiloReact<AppFileRouter>({
  endpoint: "/api/sdk-demo/upload",
});
