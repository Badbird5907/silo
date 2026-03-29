"use server";

import { headers } from "next/headers";

import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys, projects } from "@silo-storage/db/schema";
import {
  generatePublicDownloadUrl,
  generateSignedDownloadUrl,
} from "@silo-storage/shared/signing";

import { auth } from "@/auth/server";
import { env } from "@/env";

interface GetDownloadUrlParams {
  fileKeyId: string;
  projectId: string;
  organizationId: string;
}

export async function getDownloadUrl({
  fileKeyId,
  projectId,
  organizationId,
}: GetDownloadUrlParams): Promise<{ url: string; isPublic: boolean } | null> {
  const requestHeaders = new Headers(await headers());
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return null;
  }

  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.parentOrganizationId, organizationId),
    ),
  });

  if (!project) {
    return null;
  }

  const fileKey = await db.query.fileKeys.findFirst({
    where: and(eq(fileKeys.id, fileKeyId), eq(fileKeys.projectId, projectId)),
    with: { file: true },
  });

  if (!fileKey) {
    return null;
  }

  // isPublic is now stored directly on fileKey (resolved at creation time)
  const isPublic = fileKey.isPublic;

  const isDevelopment = env.NODE_ENV === "development";
  const protocol = isDevelopment ? "http" : "https";

  if (isPublic) {
    const url = generatePublicDownloadUrl(
      env.WORKER_DOMAIN,
      project.slug,
      fileKey.accessKey,
      fileKey.fileName,
      {
        routeMode: env.PROJECT_ROUTE_MODE,
        routePrefix: env.PROJECT_ROUTE_PREFIX,
      },
    );
    return { url: url.replace("https://", `${protocol}://`), isPublic: true };
  }

  const url = await generateSignedDownloadUrl(
    env.WORKER_DOMAIN,
    project.slug,
    {
      fileKeyId: fileKey.id,
      accessKey: fileKey.accessKey,
      fileName: fileKey.fileName,
      expiresIn: 3600,
    },
    env.SIGNING_SECRET,
    {
      routeMode: env.PROJECT_ROUTE_MODE,
      routePrefix: env.PROJECT_ROUTE_PREFIX,
    },
  );

  return { url: url.replace("https://", `${protocol}://`), isPublic: false };
}
