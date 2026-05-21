import type { Bindings } from "../../types/bindings";
import { listObjects } from "./upload";

export interface DeletePrefixQueueMessage {
  prefix: string;
  cursor?: string;
  requestId: string;
  startedAt: string;
}

const LIST_LIMIT = 1000;
const MAX_OBJECTS_PER_INVOCATION = 5000;

// this is to handle an insane amount of objects
export async function deletePrefixChunk(params: {
  prefix: string;
  cursor?: string;
  env: Bindings;
}) {
  let cursor = params.cursor;
  let processed = 0;
  let deleted = 0;

  while (processed < MAX_OBJECTS_PER_INVOCATION) {
    const pageLimit = Math.min(
      LIST_LIMIT,
      MAX_OBJECTS_PER_INVOCATION - processed,
    );
    const page = await listObjects({
      prefix: params.prefix,
      cursor,
      limit: pageLimit,
      env: params.env,
    });

    const keys = page.objects.map((obj) => obj.key);
    if (keys.length > 0) {
      await params.env.R2_BUCKET.delete(keys);
      deleted += keys.length;
      processed += keys.length;
    }

    if (!page.truncated) {
      return {
        processed,
        deleted,
        truncated: false,
        cursor: null as string | null,
      };
    }

    cursor = page.cursor;
    if (!cursor) {
      return {
        processed,
        deleted,
        truncated: false,
        cursor: null as string | null,
      };
    }

    if (processed >= MAX_OBJECTS_PER_INVOCATION) {
      return {
        processed,
        deleted,
        truncated: true,
        cursor,
      };
    }
  }

  return {
    processed,
    deleted,
    truncated: !!cursor,
    cursor: cursor ?? null,
  };
}
