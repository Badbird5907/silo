import { describe, expect, it } from "vitest";

import {
  buildInternalCallbackMetadata,
  getUserVisibleCallbackMetadata,
  readInternalCallbackEnvelope,
  SILO_CALLBACK_ENVELOPE_KEY,
  SILO_CALLBACK_ENVELOPE_VERSION,
} from "./envelope";

describe("buildInternalCallbackMetadata", () => {
  it("attaches the envelope under the silo key with the current version", () => {
    const out = buildInternalCallbackMetadata({ routeSlug: "imageUploader" });
    expect(out[SILO_CALLBACK_ENVELOPE_KEY]).toEqual({
      version: SILO_CALLBACK_ENVELOPE_VERSION,
      routeSlug: "imageUploader",
    });
  });

  it("preserves caller-supplied extraMetadata fields", () => {
    const out = buildInternalCallbackMetadata({
      routeSlug: "x",
      extraMetadata: { userId: "u1", tag: "test" },
    });
    expect(out.userId).toBe("u1");
    expect(out.tag).toBe("test");
  });

  it("does not let extraMetadata overwrite the envelope key", () => {
    const out = buildInternalCallbackMetadata({
      routeSlug: "x",
      extraMetadata: { [SILO_CALLBACK_ENVELOPE_KEY]: "tampered" },
    });
    expect(out[SILO_CALLBACK_ENVELOPE_KEY]).toEqual({
      version: SILO_CALLBACK_ENVELOPE_VERSION,
      routeSlug: "x",
    });
  });
});

describe("readInternalCallbackEnvelope", () => {
  it("round-trips with buildInternalCallbackMetadata", () => {
    const metadata = buildInternalCallbackMetadata({ routeSlug: "slug" });
    expect(readInternalCallbackEnvelope(metadata)).toEqual({
      version: SILO_CALLBACK_ENVELOPE_VERSION,
      routeSlug: "slug",
    });
  });

  it("throws when the envelope key is missing", () => {
    expect(() => readInternalCallbackEnvelope({})).toThrow(
      new RegExp(SILO_CALLBACK_ENVELOPE_KEY),
    );
  });

  it("throws when the envelope has the wrong version", () => {
    expect(() =>
      readInternalCallbackEnvelope({
        [SILO_CALLBACK_ENVELOPE_KEY]: { version: 999, routeSlug: "x" },
      }),
    ).toThrow();
  });

  it("throws when routeSlug is empty", () => {
    expect(() =>
      readInternalCallbackEnvelope({
        [SILO_CALLBACK_ENVELOPE_KEY]: {
          version: SILO_CALLBACK_ENVELOPE_VERSION,
          routeSlug: "",
        },
      }),
    ).toThrow();
  });

  it("throws for non-object inputs (null, arrays, primitives)", () => {
    expect(() => readInternalCallbackEnvelope(null)).toThrow();
    expect(() => readInternalCallbackEnvelope([])).toThrow();
    expect(() => readInternalCallbackEnvelope("string")).toThrow();
    expect(() => readInternalCallbackEnvelope(42)).toThrow();
  });
});

describe("getUserVisibleCallbackMetadata", () => {
  it("strips the silo envelope and internal callback fields", () => {
    const metadata = {
      userId: "u1",
      [SILO_CALLBACK_ENVELOPE_KEY]: { version: 1, routeSlug: "x" },
      callbackUrl: "https://example.com/cb",
      apiKeyId: "k1",
    };
    expect(getUserVisibleCallbackMetadata(metadata)).toEqual({ userId: "u1" });
  });

  it("returns a shallow copy (does not mutate the input)", () => {
    const metadata = {
      userId: "u1",
      [SILO_CALLBACK_ENVELOPE_KEY]: { version: 1, routeSlug: "x" },
    };
    const result = getUserVisibleCallbackMetadata(metadata);
    expect(result).not.toBe(metadata);
    // Original is left intact.
    expect(metadata[SILO_CALLBACK_ENVELOPE_KEY]).toBeDefined();
  });

  it("returns an empty object for non-object inputs", () => {
    expect(getUserVisibleCallbackMetadata(null)).toEqual({});
    expect(getUserVisibleCallbackMetadata(undefined)).toEqual({});
    expect(getUserVisibleCallbackMetadata([1, 2])).toEqual({});
  });
});
