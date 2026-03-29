import { z } from "zod";

export const SILO_CALLBACK_ENVELOPE_KEY = "__silo";
export const SILO_CALLBACK_ENVELOPE_VERSION = 1 as const;

const siloCallbackEnvelopeSchema = z.object({
  version: z.literal(SILO_CALLBACK_ENVELOPE_VERSION),
  routeSlug: z.string().min(1),
});

export type SiloCallbackEnvelope = z.infer<typeof siloCallbackEnvelopeSchema>;

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export interface BuildInternalCallbackMetadataInput {
  routeSlug: string;
  extraMetadata?: Record<string, unknown>;
}

export function buildInternalCallbackMetadata(
  input: BuildInternalCallbackMetadataInput,
): Record<string, unknown> {
  return {
    ...(input.extraMetadata ?? {}),
    [SILO_CALLBACK_ENVELOPE_KEY]: {
      version: SILO_CALLBACK_ENVELOPE_VERSION,
      routeSlug: input.routeSlug,
    },
  };
}

export function readInternalCallbackEnvelope(
  metadata: unknown,
): SiloCallbackEnvelope {
  const record = toRecord(metadata);
  const parsed = siloCallbackEnvelopeSchema.safeParse(
    record[SILO_CALLBACK_ENVELOPE_KEY],
  );
  if (!parsed.success) {
    throw new Error(
      `Missing or invalid ${SILO_CALLBACK_ENVELOPE_KEY} callback envelope: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function getUserVisibleCallbackMetadata(
  metadata: unknown,
): Record<string, unknown> {
  const record = toRecord(metadata);
  const sanitized = { ...record };
  delete sanitized[SILO_CALLBACK_ENVELOPE_KEY];
  delete sanitized.callbackUrl;
  delete sanitized.apiKeyId;
  return sanitized;
}
