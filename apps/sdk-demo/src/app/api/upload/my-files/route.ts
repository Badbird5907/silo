import { auth } from "@clerk/nextjs/server";

import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

import { env } from "@/env";

const core = createSiloCoreFromToken({
  url: env.SILO_URL,
  token: env.SILO_TOKEN,
});

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
    const result = await core.listFiles({
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
