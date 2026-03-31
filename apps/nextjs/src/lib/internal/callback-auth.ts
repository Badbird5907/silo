import { env } from "@/env";

export type CallbackAuthFailure =
  | { kind: "missing_format"; header: string | null }
  | { kind: "bad_token"; token: string | undefined };

/** Result of parsing `Authorization: Bearer …` against `CALLBACK_SECRET`. */
export function checkCallbackAuthorization(
  request: Request,
): true | CallbackAuthFailure {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return { kind: "missing_format", header };
  }
  const token = header.split(" ")[1];
  if (!token || token !== env.CALLBACK_SECRET) {
    return { kind: "bad_token", token };
  }
  return true;
}

export function isCallbackAuthorized(request: Request): boolean {
  return checkCallbackAuthorization(request) === true;
}
