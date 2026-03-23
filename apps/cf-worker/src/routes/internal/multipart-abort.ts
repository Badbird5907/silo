import type { Context } from "hono";
import { z } from "zod";

import type { Bindings, Variables } from "../../types/bindings";
import { abortMultipartUpload } from "../../services/r2/upload";
import { HTTP_STATUS } from "../../utils/constants";

const schema = z.object({
  adapterKey: z.string().min(1),
  uploadId: z.string().min(1),
});

function isNoSuchUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("nosuchupload") ||
    message.includes("no such upload") ||
    message.includes("upload does not exist")
  );
}

export async function handleInternalMultipartAbort(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: "Invalid request body",
        details: parsed.error.issues,
      },
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const { adapterKey, uploadId } = parsed.data;

  try {
    await abortMultipartUpload({
      adapterKey,
      uploadId,
      env: c.env,
    });

    return c.json({ success: true }, HTTP_STATUS.OK);
  } catch (error) {
    if (isNoSuchUploadError(error)) {
      return c.json({ success: true, alreadyGone: true }, HTTP_STATUS.OK);
    }

    console.error("Multipart abort failed:", error);
    return c.json(
      { success: false, error: "Failed to abort multipart upload" },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
