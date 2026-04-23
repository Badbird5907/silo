import { z } from "zod";

import {
  authenticateRequest,
  jsonError,
} from "@/lib/api-key-middleware";
import { setCompletionRecord } from "@/lib/upload/completion";

const requestSchema = z.object({
  fileKeyId: z.string().min(1),
  namespace: z.string().min(1).optional(),
  completion: z
    .object({
      contractVersion: z.number().int().positive().optional(),
      source: z.string().optional(),
      routeSlug: z.string().optional(),
      completedAt: z.number().int().positive().optional(),
      onUploadCompleteResult: z.unknown(),
    })
    .catchall(z.unknown()),
  ttlSeconds: z.number().int().positive().max(7 * 24 * 60 * 60).optional(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;
  if (authResult.type !== "apiKey" || !authResult.apiKey.rawKey) {
    return jsonError(
      "Unauthorized",
      "API key is required for completion writes.",
      401,
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request",
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

  const record = await setCompletionRecord({
    fileKeyId: parsed.data.fileKeyId,
    namespace: parsed.data.namespace,
    completion: parsed.data.completion,
    ttlSeconds: parsed.data.ttlSeconds,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      completion: record,
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
