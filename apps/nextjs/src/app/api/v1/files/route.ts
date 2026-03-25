import { z } from "zod";

import { and, count, desc, eq, ilike } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { fileKeys, files } from "@silo-storage/db/schema";

import {
  authenticateRequest,
  jsonError,
  jsonResponse,
  validateEnvironmentAccess,
  validateProjectAccess,
} from "@/lib/api-key-middleware";

const querySchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).optional(),
  status: z.enum(["all", "pending", "completed", "failed"]).default("all"),
});

// GET /api/v1/files
export async function GET(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    projectId: url.searchParams.get("projectId") ?? undefined,
    environmentId: url.searchParams.get("environmentId") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });

  if (!parsedQuery.success) {
    return jsonError(
      "Bad Request",
      "Invalid query parameters.",
      400,
      parsedQuery.error.issues,
    );
  }

  const input = parsedQuery.data;

  const project = await validateProjectAccess(authResult, input.projectId);
  if (project instanceof Response) return project;

  if (input.environmentId) {
    const environment = await validateEnvironmentAccess(
      input.environmentId,
      input.projectId,
    );
    if (environment instanceof Response) return environment;
  }

  try {
    const conditions = [eq(fileKeys.projectId, input.projectId)];

    if (input.environmentId) {
      conditions.push(eq(fileKeys.environmentId, input.environmentId));
    }

    if (input.search) {
      conditions.push(ilike(fileKeys.fileName, `%${input.search}%`));
    }

    if (input.status !== "all") {
      conditions.push(eq(fileKeys.status, input.status));
    }

    const where = and(...conditions);

    const [countResult] = await db
      .select({ count: count() })
      .from(fileKeys)
      .where(where);

    const totalCount = countResult?.count ?? 0;
    const totalPages = Math.ceil(totalCount / input.pageSize);
    const offset = (input.page - 1) * input.pageSize;

    const rows = await db
      .select({
        id: fileKeys.id,
        fileName: fileKeys.fileName,
        accessKey: fileKeys.accessKey,
        projectId: fileKeys.projectId,
        environmentId: fileKeys.environmentId,
        fileId: fileKeys.fileId,
        status: fileKeys.status,
        isPublic: fileKeys.isPublic,
        claimedHash: fileKeys.claimedHash,
        claimedMimeType: fileKeys.claimedMimeType,
        claimedSize: fileKeys.claimedSize,
        metadata: fileKeys.metadata,
        expiresAt: fileKeys.expiresAt,
        uploadCompletedAt: fileKeys.uploadCompletedAt,
        uploadFailedAt: fileKeys.uploadFailedAt,
        createdAt: fileKeys.createdAt,
        fileHash: files.hash,
        fileMimeType: files.mimeType,
        fileSize: files.size,
        storageKey: files.storageKey,
      })
      .from(fileKeys)
      .leftJoin(files, eq(fileKeys.fileId, files.id))
      .where(where)
      .orderBy(desc(fileKeys.createdAt))
      .limit(input.pageSize)
      .offset(offset);

    return jsonResponse({
      files: rows.map((row) => ({
        id: row.id,
        fileName: row.fileName,
        accessKey: row.accessKey,
        projectId: row.projectId,
        environmentId: row.environmentId,
        fileId: row.fileId,
        status: row.status,
        isPublic: row.isPublic,
        metadata: row.metadata,
        expiresAt: row.expiresAt,
        uploadCompletedAt: row.uploadCompletedAt,
        uploadFailedAt: row.uploadFailedAt,
        createdAt: row.createdAt,
        hash: row.fileHash ?? row.claimedHash,
        mimeType: row.fileMimeType ?? row.claimedMimeType,
        size: row.fileSize ?? row.claimedSize,
        storageKey: row.storageKey ?? null,
      })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalCount,
        totalPages,
        hasNextPage: input.page < totalPages,
        hasPreviousPage: input.page > 1,
      },
    });
  } catch (error) {
    console.error("Error listing files:", error);
    return jsonError("Internal Server Error", "Failed to list files.", 500);
  }
}
