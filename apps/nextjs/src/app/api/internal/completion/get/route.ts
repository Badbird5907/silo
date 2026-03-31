import { isCallbackAuthorized } from "@/lib/internal/callback-auth";
import { getCompletionRecord } from "@/lib/upload/completion";

export async function GET(request: Request) {
  if (!isCallbackAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const fileKeyId = url.searchParams.get("fileKeyId");
  if (!fileKeyId) {
    return new Response(
      JSON.stringify({
        error: "Missing fileKeyId query param",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const completion = await getCompletionRecord(fileKeyId);
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
