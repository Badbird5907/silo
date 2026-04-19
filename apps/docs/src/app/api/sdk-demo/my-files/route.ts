import { auth } from "@clerk/nextjs/server";

import { getSiloCore } from "@/lib/sdk-demo/silo";

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
    const silo = getSiloCore();
    const result = await silo.listFiles({
      page,
      pageSize,
      status: "all",
      metadata: { userId },
    });

    const data = {
      data: {
        ...result,
        files: await Promise.all(
          result.files.map(async (file) => ({
            ...file,
            url: file.status === "completed" ? await silo.generateImageUrl(file) : null,
          })),
        ),
      },
    };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list user files.";

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
