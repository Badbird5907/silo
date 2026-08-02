import type { Context } from "hono";

import type { Bindings, Variables } from "../../types/bindings";
import { deletePrefixChunk } from "../../services/r2/delete-prefix";
import { HTTP_STATUS } from "../../utils/constants";

interface DeletePrefixRequestBody {
  prefix?: string;
  cursor?: string;
}

export async function handleInternalDeletePrefix(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  const body = await c.req.json<DeletePrefixRequestBody>();
  const { prefix, cursor } = body;

  if (!prefix) {
    return c.json({ error: "prefix is required" }, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const result = await deletePrefixChunk({
      prefix,
      cursor,
      env: c.env,
    });

    return c.json(
      {
        success: true,
        mode: "blocking",
        prefix,
        ...result,
      },
      HTTP_STATUS.OK,
    );
  } catch (error) {
    console.error("Delete prefix failed:", error);
    return c.json(
      { error: "Failed to delete files by prefix" },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
