import type { StandardSchemaV1 } from "@standard-schema/spec";

import { SiloRouteInputValidationError } from "../errors";

function normalizeIssuePath(
  path: readonly unknown[] | undefined,
): PropertyKey[] | undefined {
  if (!path || path.length === 0) {
    return undefined;
  }

  return path.map((segment) =>
    typeof segment === "object" &&
    segment !== null &&
    Object.hasOwn(segment, "key")
      ? (segment as { key: PropertyKey }).key
      : (segment as PropertyKey),
  );
}

export async function parseRouteInput<TInput>(input: {
  routeSlug: string;
  schema?: StandardSchemaV1<unknown, TInput>;
  rawInput: unknown;
}): Promise<TInput> {
  if (!input.schema) {
    return input.rawInput as TInput;
  }

  let result = input.schema["~standard"].validate(input.rawInput);
  if (result instanceof Promise) {
    result = await result;
  }

  if (result.issues) {
    throw new SiloRouteInputValidationError({
      routeSlug: input.routeSlug,
      issues: result.issues.map((issue) => ({
        message: issue.message,
        path: normalizeIssuePath(issue.path),
      })),
    });
  }

  return result.value;
}
