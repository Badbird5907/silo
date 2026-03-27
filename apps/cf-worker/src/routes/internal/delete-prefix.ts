import type { Context } from "hono";

import type { DeletePrefixQueueMessage } from "../../services/r2/delete-prefix";
import type { Bindings, Variables } from "../../types/bindings";
import { deletePrefixChunk } from "../../services/r2/delete-prefix";
import { HTTP_STATUS } from "../../utils/constants";

interface DeletePrefixRequestBody {
  prefix?: string;
  cursor?: string;
  blocking?: boolean;
}

export async function handleInternalDeletePrefix(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<Response> {
  const body = await c.req.json<DeletePrefixRequestBody>();
  const { prefix, cursor, blocking } = body;
  const shouldBlock = blocking === true;

  if (!prefix) {
    return c.json({ error: "prefix is required" }, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    if (shouldBlock) {
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
    }

    const deletePrefixQueue: {
      send(message: DeletePrefixQueueMessage): Promise<void>;
    } = c.env.DELETE_PREFIX_QUEUE;
    const message: DeletePrefixQueueMessage = {
      prefix,
      requestId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
    };
    await deletePrefixQueue.send(message);

    return c.json(
      {
        success: true,
        accepted: true,
        requestId: message.requestId,
        prefix,
      },
      HTTP_STATUS.ACCEPTED,
    );
  } catch (error) {
    console.error("Delete prefix enqueue failed:", error);
    return c.json(
      { error: "Failed to delete files by prefix" },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
