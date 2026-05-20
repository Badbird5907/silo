import type { Bindings } from "../../types/bindings";
import type { UploadStateMetadata } from "../../types/upload-state";

export function isUploadExpired(metadata: UploadStateMetadata): boolean {
  const expiresAt = new Date(metadata.expiresAt);
  return expiresAt < new Date();
}

export function generateExpirationDate(env: Bindings): string {
  const hours = parseInt(env.UPLOAD_EXPIRATION_HOURS);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  return expiresAt.toUTCString();
}
