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
    return accept();
  }

  return accept;
}
