export const UPLOAD_PROTOCOL_VERSION = "1.0.0";
export const UPLOAD_SUPPORTED_PROTOCOL_VERSIONS = ["1.0.0"] as const;
export const UPLOAD_SUPPORTED_PROTOCOL_VERSIONS_STRING =
  UPLOAD_SUPPORTED_PROTOCOL_VERSIONS.join(",");

export const UPLOAD_PROTOCOL_HEADER = "X-Silo-Upload-Version";
export const UPLOAD_PROTOCOL_VERSION_HEADER = "X-Silo-Upload-Versions";
export const UPLOAD_EXTENSION_HEADER = "X-Silo-Upload-Extension";
export const UPLOAD_MAX_SIZE_HEADER = "X-Silo-Upload-Max-Size";

export const UPLOAD_OFFSET_HEADER = "Upload-Offset";
export const UPLOAD_LENGTH_HEADER = "Upload-Length";
export const UPLOAD_DEFER_LENGTH_HEADER = "Upload-Defer-Length";
export const UPLOAD_METADATA_HEADER = "Upload-Metadata";
export const UPLOAD_EXPIRES_HEADER = "Upload-Expires";

export const CONTENT_TYPE_OCTET_STREAM = "application/offset+octet-stream";

export const RESERVED_SLUGS = [
  "www",
  "api",
  "admin",
  "internal",
  "health",
  "status",
  "cdn",
  "assets",
  "static",
  "docs",
  "blog",
  "mail",
  "ftp",
  "smtp",
  "imap",
  "pop",
  "webmail",
  "cpanel",
  "whm",
  "secure",
  "ssl",
  "ftp",
  "sftp",
  "ssh",
  "git",
  "svn",
  "hg",
] as const;

export const ERROR_CODES = {
  INVALID_UPLOAD_PROTOCOL_VERSION: "invalid_upload_version",
  INVALID_CONTENT_TYPE: "invalid_content_type",
  INVALID_REQUEST: "invalid_request",
  OFFSET_MISMATCH: "offset_mismatch",
  UPLOAD_NOT_FOUND: "upload_not_found",
  UPLOAD_EXPIRED: "upload_expired",
  FILE_NOT_FOUND: "file_not_found",
  FILE_EXPIRED: "file_expired",
  SIGNATURE_INVALID: "signature_invalid",
  UNAUTHORIZED: "unauthorized",
  PROJECT_NOT_FOUND: "project_not_found",
  HASH_MISMATCH: "hash_mismatch",
  MIME_TYPE_MISMATCH: "mime_type_mismatch",
  MIME_TYPE_NOT_ALLOWED: "mime_type_not_allowed",
  SIZE_MISMATCH: "size_mismatch",
  UPLOAD_TOO_LARGE: "upload_too_large",
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  PRECONDITION_FAILED: 412,
  REQUEST_ENTITY_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_SERVER_ERROR: 500,
} as const;
