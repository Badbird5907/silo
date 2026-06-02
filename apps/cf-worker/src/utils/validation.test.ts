import { describe, expect, it } from "vitest";

import {
  isValidBase64,
  isValidMetadataKey,
  parseNonNegativeInt,
  sanitizeHeaderValue,
} from "./validation";

describe("parseNonNegativeInt", () => {
  it("returns null for undefined or empty input", () => {
    expect(parseNonNegativeInt(undefined)).toBeNull();
    expect(parseNonNegativeInt("")).toBeNull();
  });

  it("parses zero and positive integers", () => {
    expect(parseNonNegativeInt("0")).toBe(0);
    expect(parseNonNegativeInt("1")).toBe(1);
    expect(parseNonNegativeInt("12345")).toBe(12345);
  });

  it("rejects leading zeros (other than the literal '0')", () => {
    expect(parseNonNegativeInt("01")).toBeNull();
    expect(parseNonNegativeInt("007")).toBeNull();
  });

  it("rejects negative, decimal, and non-numeric values", () => {
    expect(parseNonNegativeInt("-1")).toBeNull();
    expect(parseNonNegativeInt("1.5")).toBeNull();
    expect(parseNonNegativeInt("abc")).toBeNull();
    expect(parseNonNegativeInt(" 1")).toBeNull();
    expect(parseNonNegativeInt("1 ")).toBeNull();
  });

  it("rejects integers larger than MAX_SAFE_INTEGER", () => {
    expect(parseNonNegativeInt("9007199254740993")).toBeNull();
  });
});

describe("sanitizeHeaderValue", () => {
  it("strips CR, LF, and NUL bytes", () => {
    expect(sanitizeHeaderValue("foo\r\nbar")).toBe("foobar");
    expect(sanitizeHeaderValue("a\0b\rc\nd")).toBe("abcd");
  });

  it("preserves benign whitespace and printable characters", () => {
    expect(sanitizeHeaderValue("hello world")).toBe("hello world");
    expect(sanitizeHeaderValue("x-tab\tvalue")).toBe("x-tab\tvalue");
  });
});

describe("isValidMetadataKey", () => {
  it("accepts simple ASCII keys", () => {
    expect(isValidMetadataKey("filename")).toBe(true);
    expect(isValidMetadataKey("user-id_42")).toBe(true);
  });

  it("rejects empty keys", () => {
    expect(isValidMetadataKey("")).toBe(false);
  });

  it("rejects keys containing whitespace or commas", () => {
    expect(isValidMetadataKey("foo bar")).toBe(false);
    expect(isValidMetadataKey("foo\tbar")).toBe(false);
    expect(isValidMetadataKey("a,b")).toBe(false);
  });

  it("rejects keys with non-ASCII characters", () => {
    expect(isValidMetadataKey("café")).toBe(false);
    expect(isValidMetadataKey("ключ")).toBe(false);
  });
});

describe("isValidBase64", () => {
  it("treats empty string as valid", () => {
    expect(isValidBase64("")).toBe(true);
  });

  it("accepts canonical base64 round-trips", () => {
    expect(isValidBase64(btoa("hello"))).toBe(true);
    expect(isValidBase64(btoa("filename.txt"))).toBe(true);
  });

  it("rejects values that do not round-trip through btoa(atob(x))", () => {
    // Missing padding
    expect(isValidBase64("aGVsbG8")).toBe(false);
    // Invalid character
    expect(isValidBase64("not_base64!")).toBe(false);
  });
});
