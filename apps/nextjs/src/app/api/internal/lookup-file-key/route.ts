import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys } from "@silo-storage/db/schema";

import { env } from "@/env";

export async function POST(request: Request) {
  const header = request.headers.get("Authorization");
  if (
    !header?.startsWith("Bearer ") ||
    header.split(" ")[1] !== env.CALLBACK_SECRET
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const { accessKey, projectId } = body as {
      accessKey?: string;
      projectId?: string;
    };

    if (!accessKey || !projectId) {
      return new Response(
        JSON.stringify({ error: "accessKey and projectId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const fileKey = await db.query.fileKeys.findFirst({
      where: and(
        eq(fileKeys.accessKey, accessKey),
        eq(fileKeys.projectId, projectId),
      ),
      with: {
        file: true,
      },
    });

    if (!fileKey) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const responseBody = {
      ...fileKey,
      file: fileKey.file
        ? {
            ...fileKey.file,
            adapterKey: fileKey.file.storageKey,
          }
        : null,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error looking up file key:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
