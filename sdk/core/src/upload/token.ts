import { z } from "zod";
import type { UploadStrategy } from "./types";

const siloTokenSchema = z
  .object({
    v: z.number().int().positive(),
    ak: z.string().min(1),
    kid: z.string().min(1),
    eid: z.string().min(1),
    is: z.string().min(1),
    ss: z.string().min(1),
    rm: z.enum(["s", "p"]),
    ps: z.string().min(1),
  })
  .strict();

export interface ParsedSiloToken {
  version: number;
  apiKey: string;
  apiKeyId: string;
  environmentId: string;
  ingestServer: string;
  signingSecret: string;
  routeMode: "subdomain" | "path";
  projectSlug: string;
}

export interface CreateSiloCoreFromTokenInput {
  url: string;
  token: string;
  uploadStrategy?: UploadStrategy;
  callbackUrl?: string;
  fetch?: typeof fetch;
}

function decodeBase64UrlUtf8(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  if (typeof atob === "function") {
    return atob(padded);
  }

  const globalBuffer = (
    globalThis as {
      Buffer?: {
        from: (
          value: string,
          encoding: string,
        ) => { toString: (encoding: string) => string };
      };
    }
  ).Buffer;
  if (globalBuffer) {
    return globalBuffer.from(padded, "base64").toString("utf8");
  }

  throw new Error("Unable to decode SILO_TOKEN in this runtime.");
}

export function encodeSiloToken(payload: {
  v: number;
  ak: string;
  kid: string;
  eid: string;
  is: string;
  ss: string;
  rm: "s" | "p";
  ps: string;
}): string {
  const json = JSON.stringify(payload);
  if (typeof btoa === "function") {
    return btoa(json)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  const globalBuffer = (
    globalThis as {
      Buffer?: {
        from: (
          value: string,
          encoding: string,
        ) => { toString: (encoding: string) => string };
      };
    }
  ).Buffer;
  if (globalBuffer) {
    return globalBuffer
      .from(json, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  throw new Error("Unable to encode SILO_TOKEN in this runtime.");
}

export function parseSiloToken(token: string): ParsedSiloToken {
  const decoded = decodeBase64UrlUtf8(token);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(decoded);
  } catch {
    throw new Error("Invalid SILO_TOKEN: expected base64url-encoded JSON.");
  }

  const parsed = siloTokenSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`Invalid SILO_TOKEN: ${parsed.error.message}`);
  }

  return {
    version: parsed.data.v,
    apiKey: parsed.data.ak,
    apiKeyId: parsed.data.kid,
    environmentId: parsed.data.eid,
    ingestServer: parsed.data.is,
    signingSecret: parsed.data.ss,
    routeMode: parsed.data.rm === "p" ? "path" : "subdomain",
    projectSlug: parsed.data.ps,
  };
}
