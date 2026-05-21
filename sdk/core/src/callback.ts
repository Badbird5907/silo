import { z } from "zod";

export interface SignCallbackPayloadInput {
  payload: string;
  signingSecret: string;
  timestamp?: number;
}

export interface SignedCallbackPayload {
  timestamp: number;
  signature: string;
}

export interface VerifyCallbackSignatureInput {
  payload: string;
  signingSecret: string;
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  maxAgeSeconds?: number;
  nowMs?: number;
}

export interface CallbackEnvelope {
  metadata: Record<string, unknown>;
  data: unknown;
}

export interface VerifyAndParseUploadCallbackInput {
  request:
    | Request
    | {
        headers: Headers | Record<string, string | undefined>;
        body: string;
      };
  signingSecret: string;
  maxAgeSeconds?: number;
}

export type VerifyAndParseUploadCallbackResult = CallbackEnvelope;
export type HandleUploadCallbackInput = VerifyAndParseUploadCallbackInput;
export type HandleUploadCallbackResult = VerifyAndParseUploadCallbackResult;

const signatureHeaderPieceSchema = z
  .object({
    key: z.string(),
    value: z.string(),
  })
  .array();

const callbackEnvelopeSchema = z.object({
  metadata: z.record(z.string(), z.unknown()),
  data: z.unknown(),
});

function parseSignatureHeader(value: string): {
  timestamp?: number;
  v1?: string;
} {
  const entriesResult = signatureHeaderPieceSchema.safeParse(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) {
          return { key: part, value: "" };
        }
        return {
          key: part.slice(0, separator),
          value: part.slice(separator + 1),
        };
      }),
  );
  if (!entriesResult.success) {
    return {};
  }

  const entries = entriesResult.data;
  const timestampRaw = entries.find((entry) => entry.key === "t")?.value;
  const v1 = entries.find((entry) => entry.key === "v1")?.value;
  const timestamp = timestampRaw
    ? Number.parseInt(timestampRaw, 10)
    : undefined;
  return {
    timestamp: Number.isFinite(timestamp) ? timestamp : undefined,
    v1,
  };
}

function normalizeHeaders(
  headers: Headers | Record<string, string | undefined>,
): Headers {
  if (headers instanceof Headers) return headers;
  const normalized = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalized.set(key, value);
    }
  }
  return normalized;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signCallbackPayload(
  input: SignCallbackPayloadInput,
): Promise<SignedCallbackPayload> {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const digest = await hmacSha256Hex(
    input.signingSecret,
    `${timestamp}.${input.payload}`,
  );
  return {
    timestamp,
    signature: `t=${timestamp},v1=${digest}`,
  };
}

export async function verifyCallbackSignature(
  input: VerifyCallbackSignatureInput,
): Promise<void> {
  const signatureHeader = input.signatureHeader?.trim();
  if (!signatureHeader) {
    throw new Error("Missing X-Silo-Signature header");
  }

  const parsed = parseSignatureHeader(signatureHeader);
  const headerTimestamp =
    parsed.timestamp ??
    (input.timestampHeader
      ? Number.parseInt(input.timestampHeader, 10)
      : undefined);
  if (!headerTimestamp || Number.isNaN(headerTimestamp)) {
    throw new Error("Missing timestamp in callback signature headers");
  }

  const expectedDigest = await hmacSha256Hex(
    input.signingSecret,
    `${headerTimestamp}.${input.payload}`,
  );
  if (!parsed.v1 || !timingSafeEqual(parsed.v1, expectedDigest)) {
    throw new Error("Invalid callback signature");
  }

  const maxAgeSeconds = input.maxAgeSeconds ?? 300;
  const nowMs = input.nowMs ?? Date.now();
  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - headerTimestamp) > maxAgeSeconds) {
    throw new Error(
      "Callback signature timestamp is outside allowed tolerance",
    );
  }
}

function parseEnvelope(payload: string): CallbackEnvelope {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(payload);
  } catch {
    throw new Error("Callback body is not valid JSON");
  }

  const envelope = callbackEnvelopeSchema.safeParse(parsedJson);
  if (!envelope.success) {
    throw new Error(`Invalid callback body shape: ${envelope.error.message}`);
  }

  return {
    metadata: envelope.data.metadata,
    data: envelope.data.data,
  };
}

export async function verifyAndParseUploadCallback(
  input: VerifyAndParseUploadCallbackInput,
): Promise<VerifyAndParseUploadCallbackResult> {
  const headers = normalizeHeaders(input.request.headers);
  let body: string;
  const maybeRequest = input.request as Request;
  if (typeof maybeRequest.text === "function") {
    body = await maybeRequest.text();
  } else {
    body = (input.request as { body: string }).body;
  }

  await verifyCallbackSignature({
    payload: body,
    signingSecret: input.signingSecret,
    signatureHeader: headers.get("x-silo-signature"),
    timestampHeader: headers.get("x-silo-timestamp"),
    maxAgeSeconds: input.maxAgeSeconds,
  });

  return parseEnvelope(body);
}
