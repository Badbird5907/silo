import {
  ERROR_CODES,
  HTTP_STATUS,
  TUS_SUPPORTED_VERSIONS_STRING,
  TUS_VERSION,
} from "./constants";

export class TusError extends Error {
  constructor(
    public readonly code: keyof typeof ERROR_CODES,
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TusError";
  }
}

export function createErrorResponse(
  error: TusError | Error,
  tusResumable = true,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (tusResumable) {
    headers["Tus-Resumable"] = TUS_VERSION;
  }

  if (error instanceof TusError) {
    if (error.code === "INVALID_TUS_VERSION") {
      headers["Tus-Version"] = TUS_SUPPORTED_VERSIONS_STRING;
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        code: ERROR_CODES[error.code],
        ...(error.details && { details: error.details }),
      }),
      {
        status: error.statusCode,
        headers,
      },
    );
  }

  return new Response(
    JSON.stringify({
      error: error.message,
      code: "internal_error",
    }),
    {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      headers,
    },
  );
}

export const Errors = {
  invalidTusVersion: (expected: string, received?: string) =>
    new TusError(
      "INVALID_TUS_VERSION",
      HTTP_STATUS.PRECONDITION_FAILED,
      `Unsupported TUS version. Expected ${expected}${received ? `, received ${received}` : ""}`,
      { expected, received },
    ),

  invalidContentType: (expected: string, received?: string) =>
    new TusError(
      "INVALID_CONTENT_TYPE",
      HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
      `Invalid Content-Type. Expected ${expected}${received ? `, received ${received}` : ""}`,
      { expected, received },
    ),

  offsetMismatch: (expected: number, received: number) =>
    new TusError(
      "OFFSET_MISMATCH",
      HTTP_STATUS.CONFLICT,
      `Upload-Offset mismatch. Expected ${expected}, got ${received}`,
      { expected, received },
    ),

  uploadNotFound: (uploadId: string) =>
    new TusError(
      "UPLOAD_NOT_FOUND",
      HTTP_STATUS.NOT_FOUND,
      "Upload not found",
      { uploadId },
    ),

  uploadExpired: (uploadId: string) =>
    new TusError("UPLOAD_EXPIRED", HTTP_STATUS.GONE, "Upload has expired", {
      uploadId,
    }),

  fileNotFound: (identifier: string) =>
    new TusError("FILE_NOT_FOUND", HTTP_STATUS.NOT_FOUND, "File not found", {
      identifier,
    }),

  fileExpired: (identifier: string) =>
    new TusError("FILE_EXPIRED", HTTP_STATUS.GONE, "File has expired", {
      identifier,
    }),

  signatureInvalid: () =>
    new TusError(
      "SIGNATURE_INVALID",
      HTTP_STATUS.UNAUTHORIZED,
      "Invalid signature",
    ),

  unauthorized: (reason?: string) =>
    new TusError(
      "UNAUTHORIZED",
      HTTP_STATUS.UNAUTHORIZED,
      reason ?? "Unauthorized",
    ),

  projectNotFound: (slug: string) =>
    new TusError(
      "PROJECT_NOT_FOUND",
      HTTP_STATUS.NOT_FOUND,
      "Project not found",
      { slug },
    ),

  hashMismatch: (claimed: string, actual: string) =>
    new TusError(
      "HASH_MISMATCH",
      HTTP_STATUS.BAD_REQUEST,
      "File hash does not match claimed value",
      { claimed, actual },
    ),

  mimeTypeMismatch: (claimed: string, actual: string) =>
    new TusError(
      "MIME_TYPE_MISMATCH",
      HTTP_STATUS.BAD_REQUEST,
      "File MIME type does not match claimed value",
      { claimed, actual },
    ),

  mimeTypeNotAllowed: (actual: string, allowed: string[]) =>
    new TusError(
      "MIME_TYPE_NOT_ALLOWED",
      HTTP_STATUS.BAD_REQUEST,
      "File MIME type is not allowed for this upload",
      { actual, allowed },
    ),

  sizeMismatch: (claimed: number, actual: number) =>
    new TusError(
      "SIZE_MISMATCH",
      HTTP_STATUS.BAD_REQUEST,
      "File size does not match claimed value",
      { claimed, actual },
    ),

  uploadTooLarge: (size: number, maxSize: number) =>
    new TusError(
      "UPLOAD_TOO_LARGE",
      HTTP_STATUS.REQUEST_ENTITY_TOO_LARGE,
      `Upload size ${size} exceeds maximum allowed size ${maxSize}`,
      { size, maxSize },
    ),

  invalidRequest: (reason: string) =>
    new TusError("INVALID_REQUEST", HTTP_STATUS.BAD_REQUEST, reason),
};
