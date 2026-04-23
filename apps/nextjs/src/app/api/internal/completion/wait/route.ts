import { z } from "zod";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";
import { waitForCompletionRecord } from "@/lib/upload/completion";

const querySchema = z.object({
  fileKeyId: z.string().min(1),
  namespace: z.string().min(1).optional(),
  timeoutMs: z.coerce.number().int().positive().max(120_000).optional(),
});

export async function GET(request: Request) {
  if (!isCallbackAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
    },
  );
}
