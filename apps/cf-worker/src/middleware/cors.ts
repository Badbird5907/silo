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
  "X-Silo-Upload-Version",
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
  "X-Silo-Upload-Version",
  "X-Silo-Upload-Versions",
  "X-Silo-Upload-Extension",
  "X-Silo-Upload-Max-Size",
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
