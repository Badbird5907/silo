import type { UploadAccept } from "./types";

export function resolveStaticAcceptValue(
  accept: UploadAccept | undefined,
): string | undefined {
  return typeof accept === "string" ? accept : undefined;
}

export async function resolveAcceptValue(
  accept: UploadAccept | undefined,
): Promise<string | undefined> {
  if (typeof accept === "function") {
    const value = await accept();
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.join(",");
    }
    return undefined;
  }

  if (typeof accept === "string") {
    return accept;
  }

  if (Array.isArray(accept)) {
    return accept.join(",");
  }

  return undefined;
}
