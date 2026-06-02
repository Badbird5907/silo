import { afterEach, describe, expect, it, vi } from "vitest";

import type { Bindings } from "../../types/bindings";
import type { UploadStateMetadata } from "../../types/upload-state";
import { generateExpirationDate, isUploadExpired } from "./metadata";

function makeMetadata(expiresAt: string): UploadStateMetadata {
  return { expiresAt } as UploadStateMetadata;
}

function makeEnv(hours: string): Bindings {
  return { UPLOAD_EXPIRATION_HOURS: hours } as unknown as Bindings;
}

describe("isUploadExpired", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when expiresAt is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(isUploadExpired(makeMetadata("2026-01-02T00:00:00Z"))).toBe(false);
  });

  it("returns true when expiresAt is in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    expect(isUploadExpired(makeMetadata("2026-01-01T00:00:00Z"))).toBe(true);
  });

  it("returns false at exactly the expiration instant", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);
    // expiresAt < now is the predicate; equal should be considered not expired.
    expect(isUploadExpired(makeMetadata(now.toISOString()))).toBe(false);
  });
});

describe("generateExpirationDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a UTC string `hours` ahead of the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const result = generateExpirationDate(makeEnv("24"));
    expect(new Date(result).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("throws when UPLOAD_EXPIRATION_HOURS is missing, non-numeric, or non-positive", () => {
    expect(() => generateExpirationDate(makeEnv(""))).toThrow(
      /UPLOAD_EXPIRATION_HOURS/,
    );
    expect(() => generateExpirationDate(makeEnv("abc"))).toThrow(
      /UPLOAD_EXPIRATION_HOURS/,
    );
    expect(() => generateExpirationDate(makeEnv("0"))).toThrow(
      /UPLOAD_EXPIRATION_HOURS/,
    );
    expect(() => generateExpirationDate(makeEnv("-1"))).toThrow(
      /UPLOAD_EXPIRATION_HOURS/,
    );
  });
});
