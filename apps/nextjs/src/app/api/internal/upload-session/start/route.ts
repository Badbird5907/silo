import { z } from "zod";

import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import {
  fileKeys,
  projectEnvironments,
  projects,
} from "@silo-storage/db/schema";
import {
  getUploadSessionAdapterData,
  setUploadSessionAdapterData,
} from "@silo-storage/shared";

import { env } from "@/env";

const schema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  fileKeyId: z.string().min(1),
  uploadId: z.string().min(1),
  adapterKey: z.string().min(1),
});

export async function POST(request: Request) {
  const header = request.headers.get("Authorization");
  if (
    !header?.startsWith("Bearer ") ||
    header.split(" ")[1] !== env.CALLBACK_SECRET
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request body",
        details: parsed.error.issues,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { projectId, environmentId, fileKeyId, uploadId, adapterKey } =
    parsed.data;

  const [project, environment] = await Promise.all([
    db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { id: true, lifecycleState: true },
    }),
    db.query.projectEnvironments.findFirst({
      where: and(
        eq(projectEnvironments.id, environmentId),
        eq(projectEnvironments.projectId, projectId),
      ),
      columns: { id: true, lifecycleState: true },
    }),
  ]);

  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (project.lifecycleState === "deleting") {
    return new Response(
      JSON.stringify({
        error: "Upload session cannot be registered while project is deleting",
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!environment) {
    return new Response(JSON.stringify({ error: "Environment not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (environment.lifecycleState === "deleting") {
    return new Response(
      JSON.stringify({
        error:
          "Upload session cannot be registered while environment is deleting",
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const existing = await db.query.fileKeys.findFirst({
    where: and(
      eq(fileKeys.id, fileKeyId),
      eq(fileKeys.projectId, projectId),
      eq(fileKeys.environmentId, environmentId),
    ),
    columns: {
      id: true,
      status: true,
      adapterData: true,
    },
  });

  if (!existing) {
    return new Response(JSON.stringify({ error: "File key not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (existing.status !== "pending") {
    return new Response(
      JSON.stringify({
        error: "Upload session cannot be registered for non-pending file key",
        status: existing.status,
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const uploadSession = getUploadSessionAdapterData(existing.adapterData);

  if (uploadSession?.id && uploadSession.id !== uploadId) {
    return new Response(
      JSON.stringify({
        error: "Upload session already exists for file key",
        uploadSessionId: uploadSession.id,
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (uploadSession?.storageKey && uploadSession.storageKey !== adapterKey) {
    return new Response(
      JSON.stringify({
        error: "Upload session adapter key mismatch",
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const [updated] = await db
    .update(fileKeys)
    .set({
      adapterData: setUploadSessionAdapterData(existing.adapterData, {
        id: uploadId,
        storageKey: adapterKey,
        multipartUploadId: uploadSession?.multipartUploadId ?? null,
      }),
    })
    .where(and(eq(fileKeys.id, fileKeyId), eq(fileKeys.status, "pending")))
    .returning({ id: fileKeys.id });

  if (!updated) {
    return new Response(
      JSON.stringify({ error: "Upload session registration conflict" }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
