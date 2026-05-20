import {
  ERROR_CODES,
  HTTP_STATUS,
  UPLOAD_PROTOCOL_VERSION,
  UPLOAD_SUPPORTED_PROTOCOL_VERSIONS_STRING,
} from "./constants";

export class UploadError extends Error {
  constructor(
    public readonly code: keyof typeof ERROR_CODES,
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export function createErrorResponse(
  error: UploadError | Error,
  uploadVersion = true,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (uploadVersion) {
    headers["X-Silo-Upload-Version"] = UPLOAD_PROTOCOL_VERSION;
  }

  if (error instanceof UploadError) {
    if (error.code === "INVALID_UPLOAD_PROTOCOL_VERSION") {
      headers["X-Silo-Upload-Versions"] =
        UPLOAD_SUPPORTED_PROTOCOL_VERSIONS_STRING;
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
  invalidUploadProtocolVersion: (expected: string, received?: string) =>
    new UploadError(
      "INVALID_UPLOAD_PROTOCOL_VERSION",
      HTTP_STATUS.PRECONDITION_FAILED,
      `Unsupported upload protocol version. Expected ${expected}${received ? `, received ${received}` : ""}`,
      { expected, received },
    ),

  invalidContentType: (expected: string, received?: string) =>
    new UploadError(
      "INVALID_CONTENT_TYPE",
      HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
      `Invalid Content-Type. Expected ${expected}${received ? `, received ${received}` : ""}`,
      { expected, received },
    ),

  offsetMismatch: (expected: number, received: number) =>
    new UploadError(
      "OFFSET_MISMATCH",
      HTTP_STATUS.CONFLICT,
      `Upload-Offset mismatch. Expected ${expected}, got ${received}`,
      { expected, received },
    ),

  uploadNotFound: (uploadId: string) =>
    new UploadError(
      "UPLOAD_NOT_FOUND",
      HTTP_STATUS.NOT_FOUND,
      "Upload not found",
      { uploadId },
    ),

  uploadExpired: (uploadId: string) =>
    new UploadError("UPLOAD_EXPIRED", HTTP_STATUS.GONE, "Upload has expired", {
      uploadId,
    }),

  fileNotFound: (identifier: string) =>
    new UploadError("FILE_NOT_FOUND", HTTP_STATUS.NOT_FOUND, "File not found", {
      identifier,
    }),

  fileExpired: (identifier: string) =>
    new UploadError("FILE_EXPIRED", HTTP_STATUS.GONE, "File has expired", {
      identifier,
    }),

  signatureInvalid: () =>
    new UploadError(
      "SIGNATURE_INVALID",
      HTTP_STATUS.UNAUTHORIZED,
      "Invalid signature",
    ),

  unauthorized: (reason?: string) =>
    new UploadError(
      "UNAUTHORIZED",
      HTTP_STATUS.UNAUTHORIZED,
      reason ?? "Unauthorized",
    ),

  projectNotFound: (slug: string) =>
    new UploadError(
      "PROJECT_NOT_FOUND",
      HTTP_STATUS.NOT_FOUND,
      "Project not found",
      { slug },
    ),

  hashMismatch: (claimed: string, actual: string) =>
    new UploadError(
      "HASH_MISMATCH",
      HTTP_STATUS.BAD_REQUEST,
      "File hash does not match claimed value",
      { claimed, actual },
    ),

  mimeTypeMismatch: (claimed: string, actual: string) =>
    new UploadError(
      "MIME_TYPE_MISMATCH",
      HTTP_STATUS.BAD_REQUEST,
      "File MIME type does not match claimed value",
      { claimed, actual },
    ),

  mimeTypeNotAllowed: (actual: string, allowed: string[]) =>
    new UploadError(
      "MIME_TYPE_NOT_ALLOWED",
      HTTP_STATUS.BAD_REQUEST,
      "File MIME type is not allowed for this upload",
      { actual, allowed },
    ),

  sizeMismatch: (claimed: number, actual: number) =>
    new UploadError(
      "SIZE_MISMATCH",
      HTTP_STATUS.BAD_REQUEST,
      "File size does not match claimed value",
      { claimed, actual },
    ),

  uploadTooLarge: (size: number, maxSize: number) =>
    new UploadError(
      "UPLOAD_TOO_LARGE",
      HTTP_STATUS.REQUEST_ENTITY_TOO_LARGE,
      `Upload size ${size} exceeds maximum allowed size ${maxSize}`,
      { size, maxSize },
    ),

  invalidRequest: (reason: string) =>
    new UploadError("INVALID_REQUEST", HTTP_STATUS.BAD_REQUEST, reason),
};
