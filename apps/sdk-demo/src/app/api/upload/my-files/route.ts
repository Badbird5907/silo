import { auth } from "@clerk/nextjs/server";

import { getSiloCore } from "@/lib/silo";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Sign in required." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "20") || 20),
  );

  try {
    const result = await getSiloCore().listFiles({
      page,
      pageSize,
      status: "all",
      metadata: { userId },
    });

    return new Response(JSON.stringify({ data: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to list user files", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Failed to list user files.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
