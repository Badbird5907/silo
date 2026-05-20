import type { MiddlewareHandler } from "hono";
import { cors as honoCors } from "hono/cors";

export const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Content-Range",
  "Authorization",
  "Upload-Offset",
  "Upload-Length",
  "Upload-Defer-Length",
  "Upload-Metadata",
  "Tus-Resumable",
  "X-HTTP-Method-Override",
  "X-Requested-With",
];

export const CORS_EXPOSE_HEADERS = [
  "Upload-Offset",
  "Content-Range",
  "Upload-Length",
  "Upload-Defer-Length",
  "Upload-Metadata",
  "Upload-Expires",
  "Tus-Resumable",
  "Tus-Version",
  "Tus-Extension",
  "Tus-Max-Size",
  "Location",
];

export const cors: MiddlewareHandler = honoCors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  allowHeaders: CORS_ALLOW_HEADERS,
  exposeHeaders: CORS_EXPOSE_HEADERS,
  maxAge: 86400,
  credentials: false,
});
