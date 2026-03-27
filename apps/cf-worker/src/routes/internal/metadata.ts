import type { Context } from "hono";

import type { Bindings, Variables } from "../../types/bindings";
import { getObjectMetadata } from "../../services/r2/upload";
import { HTTP_STATUS } from "../../utils/constants";

export async function handleInternalMetadata(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  const rawStorageKey = c.req.param("*");
  const storageKey = rawStorageKey ? decodeURIComponent(rawStorageKey) : "";

  if (!storageKey) {
    return c.json({ error: "storageKey is required" }, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const metadata = await getObjectMetadata(storageKey, c.env);

    if (!metadata) {
      return c.json({ error: "File not found" }, HTTP_STATUS.NOT_FOUND);
    }

    return c.json(
      {
        size: metadata.size,
        contentType:
          metadata.httpMetadata?.contentType ?? "application/octet-stream",
        uploaded: metadata.uploaded,
        etag: metadata.etag,
        httpMetadata: metadata.httpMetadata,
        customMetadata: metadata.customMetadata,
      },
      HTTP_STATUS.OK,
    );
  } catch (error) {
    console.error("Get metadata failed:", error);
    return c.json(
      { error: "Failed to get file metadata" },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
