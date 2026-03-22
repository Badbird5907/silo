import type { Context } from "hono";

import type { Bindings, Variables } from "../../types/bindings";
import { TUS_VERSION } from "../../utils/constants";

interface TusDeleteRequestBody {
  projectId?: string;
}

export async function handleInternalTusDelete(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  const body = await c.req
    .json<TusDeleteRequestBody>()
    .catch((): TusDeleteRequestBody => ({}));

  if (!uploadId) {
    return c.json({ error: "uploadId is required" }, 400);
  }

  if (!body.projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }

  const id = c.env.TUS_STATE_DO.idFromName(uploadId);
  const stub = c.env.TUS_STATE_DO.get(id);

  const headers = new Headers();
  headers.set("Tus-Resumable", TUS_VERSION);
  headers.set("X-Project-Id", body.projectId);
  headers.set("X-Upload-Id", uploadId);

  const response = await stub.fetch(
    new Request("https://tus-state.internal/internal/delete", {
      method: "DELETE",
      headers,
    }),
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return new Response(
      JSON.stringify({
        error: "Failed to delete upload state",
        status: response.status,
        details: text,
      }),
      {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return c.json({ success: true }, 200);
}
