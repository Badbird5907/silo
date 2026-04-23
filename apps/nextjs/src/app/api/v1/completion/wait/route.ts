import { z } from "zod";

import {
  authenticateRequest,
  jsonError,
} from "@/lib/api-key-middleware";
import { waitForCompletionRecord } from "@/lib/upload/completion";

const querySchema = z.object({
  fileKeyId: z.string().min(1),
  namespace: z.string().min(1).optional(),
  timeoutMs: z.coerce.number().int().positive().max(120_000).optional(),
});

export async function GET(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;
  if (authResult.type !== "apiKey" || !authResult.apiKey.rawKey) {
    return jsonError(
      "Unauthorized",
      "API key is required for completion wait.",
      401,
    );
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid query params",
        details: parsed.error.issues,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        },
      },
    );
  }

  const timeoutMs = parsed.data.timeoutMs ?? 20_000;
  const completion = await waitForCompletionRecord(
    parsed.data.fileKeyId,
    timeoutMs,
    parsed.data.namespace,
  );

  if (!completion) {
    return new Response(
      JSON.stringify({
        ok: false,
        pending: true,
      }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      completion,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      },
    },
  );
}
