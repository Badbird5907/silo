import { eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { projects } from "@silo-storage/db/schema";

import { isCallbackAuthorized } from "@/lib/internal/callback-auth";

export async function POST(request: Request) {
  if (!isCallbackAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const { slug } = body as { slug?: string };

    if (!slug) {
      return new Response(JSON.stringify({ error: "slug is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const project = await db.query.projects.findFirst({
      where: eq(projects.slug, slug),
      columns: {
        id: true,
        defaultFileAccess: true,
        imageDeliveryPolicy: true,
        preserveImageExif: true,
        lifecycleState: true,
      },
    });

    if (!project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(project), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error looking up project by slug:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
