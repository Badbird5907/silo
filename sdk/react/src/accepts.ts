import type { UploadAccepts } from "./types";

export function resolveStaticAcceptValue(
  accepts: UploadAccepts | undefined,
): string | undefined {
  return typeof accepts === "string" ? accepts : undefined;
}

export async function resolveAcceptValue(
  accepts: UploadAccepts | undefined,
): Promise<string | undefined> {
  if (typeof accepts === "function") {
    return accepts();
  }

  return accepts;
}
