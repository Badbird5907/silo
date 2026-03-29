import { z } from "zod";

import { and, count, desc, eq, ilike, sql } from "@silo-storage/db";
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
  projectId: z.string().min(1).optional(),
  environmentId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).optional(),
  status: z.enum(["all", "pending", "completed", "failed"]).default("all"),
  metadata: z.string().optional(),
});

function parseMetadataFilter(
  value?: string,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid metadata filter JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("metadata must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}

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
    metadata: url.searchParams.get("metadata") ?? undefined,
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

  const resolvedProjectId =
    input.projectId ??
    (authResult.type === "apiKey" ? authResult.projectId : undefined);

  if (!resolvedProjectId) {
    return jsonError(
      "Bad Request",
      "projectId is required for session-based auth or unscoped API keys.",
      400,
    );
  }

  let metadataFilter: Record<string, unknown> | undefined;
  try {
    metadataFilter = parseMetadataFilter(input.metadata);
  } catch (error) {
    return jsonError(
      "Bad Request",
      error instanceof Error
        ? error.message
        : "Invalid metadata filter query parameter.",
      400,
    );
  }

  const project = await validateProjectAccess(authResult, resolvedProjectId);
  if (project instanceof Response) return project;

  if (input.environmentId) {
    const environment = await validateEnvironmentAccess(
      input.environmentId,
      resolvedProjectId,
    );
    if (environment instanceof Response) return environment;
  }

  try {
    const conditions = [eq(fileKeys.projectId, resolvedProjectId)];

    if (input.environmentId) {
      conditions.push(eq(fileKeys.environmentId, input.environmentId));
    }

    if (input.search) {
      conditions.push(ilike(fileKeys.fileName, `%${input.search}%`));
    }

    if (input.status !== "all") {
      conditions.push(eq(fileKeys.status, input.status));
    }

    if (metadataFilter) {
      conditions.push(
        sql`${fileKeys.metadata} @> ${JSON.stringify(metadataFilter)}::jsonb`,
      );
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
