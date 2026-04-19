"use client";

import { createSiloReact } from "@silo-storage/sdk-react";

import type { AppFileRouter } from "@/lib/sdk-demo/file-router";

export const { useUpload, useStagedUpload, SiloRouterConfigProvider, UploadDropzone } = createSiloReact<AppFileRouter>({
endpoint: "/api/sdk-demo/upload",
});
