import type { MiddlewareHandler } from "hono";
import { cors as honoCors } from "hono/cors";

export const cors: MiddlewareHandler = honoCors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "Upload-Offset",
    "Upload-Length",
    "Upload-Defer-Length",
    "Upload-Metadata",
    "Tus-Resumable",
    "X-HTTP-Method-Override",
    "X-Requested-With",
  ],
  exposeHeaders: [
    "Upload-Offset",
    "Upload-Length",
    "Upload-Defer-Length",
    "Upload-Metadata",
    "Upload-Expires",
    "Tus-Resumable",
    "Tus-Version",
    "Tus-Extension",
    "Tus-Max-Size",
    "Location",
  ],
  maxAge: 86400,
  credentials: false,
});
