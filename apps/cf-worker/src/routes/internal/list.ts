import type { Context } from "hono";

import type { Bindings, Variables } from "../../types/bindings";
import { listObjects } from "../../services/r2/upload";
import { HTTP_STATUS } from "../../utils/constants";

interface ListRequestBody {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export async function handleInternalList(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  const body = await c.req.json<ListRequestBody>();
  const { prefix, limit, cursor } = body;

  if (!prefix) {
    return c.json({ error: "prefix is required" }, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const result = await listObjects({
      prefix,
      limit,
      cursor,
      env: c.env,
    });

    return c.json(
      {
        objects: result.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          httpMetadata: obj.httpMetadata,
        })),
        truncated: result.truncated,
        ...(result.truncated && {
          cursor: (result as { cursor?: string }).cursor,
        }),
      },
      HTTP_STATUS.OK,
    );
  } catch (error) {
    console.error("List failed:", error);
    return c.json(
      { error: "Failed to list files" },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
