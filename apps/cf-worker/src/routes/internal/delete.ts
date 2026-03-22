import type { Context } from "hono";

import type { Bindings, Variables } from "../../types/bindings";
import { deleteObject } from "../../services/r2/upload";
import { HTTP_STATUS } from "../../utils/constants";

export async function handleInternalDelete(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  const rawAdapterKey = c.req.param("*");
  const adapterKey = rawAdapterKey ? decodeURIComponent(rawAdapterKey) : "";

  if (!adapterKey) {
    return c.json(
      { success: false, error: "adapterKey is required" },
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  try {
    await deleteObject(adapterKey, c.env);

    return c.json({ success: true }, HTTP_STATUS.OK);
  } catch (error) {
    console.error("Delete failed:", error);
    return c.json(
      { success: false, error: "Failed to delete file" },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
