import type { Context } from "hono";

import { listObjects } from "../../services/r2/upload";
import type { Bindings, Variables } from "../../types/bindings";
import { HTTP_STATUS } from "../../utils/constants";

function isLocalDevRequest(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "lvh.me" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".lvh.me")
  );
}

export async function handleDevR2ListAll(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  if (!isLocalDevRequest(c.req.url)) {
    return c.json(
      { error: "This endpoint is only available in local development" },
      HTTP_STATUS.FORBIDDEN,
    );
  }

  try {
    const objects: {
      key: string;
      size: number;
      uploaded: Date;
      httpMetadata?: R2HTTPMetadata;
    }[] = [];

    let cursor: string | undefined;
    for (;;) {
      const page = await listObjects({
        prefix: "",
        limit: 1000,
        cursor,
        env: c.env,
      });

      objects.push(
        ...page.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          httpMetadata: obj.httpMetadata,
        })),
      );

      if (!page.truncated) {
        break;
      }

      cursor = (page as { cursor?: string }).cursor;
      if (!cursor) {
        break;
      }
    }

    return c.json(
      {
        count: objects.length,
        objects,
      },
      HTTP_STATUS.OK,
    );
  } catch (error) {
    console.error("Dev R2 list-all failed:", error);
    return c.json(
      { error: "Failed to list R2 objects" },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
