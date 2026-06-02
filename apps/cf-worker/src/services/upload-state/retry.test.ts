import { describe, expect, it, vi } from "vitest";

import { CallbackRequestError } from "../callback";
import { isRetryableError, retry } from "./retry";

describe("isRetryableError", () => {
  it("delegates to CallbackRequestError.retryable", () => {
    expect(isRetryableError(new CallbackRequestError("x", 500, true))).toBe(
      true,
    );
    expect(isRetryableError(new CallbackRequestError("x", 400, false))).toBe(
      false,
    );
  });

  it("returns false for non-Error values", () => {
    expect(isRetryableError("network connection lost")).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError({ message: "timeout" })).toBe(false);
  });

  it("treats UploadStreamReadError as retryable regardless of message", () => {
    const err = new Error("nothing of substance");
    err.name = "UploadStreamReadError";
    expect(isRetryableError(err)).toBe(true);
  });

  it("matches transient network/timeout substrings (case-insensitive)", () => {
    for (const message of [
      "Network connection lost",
      "Service Unavailable",
      "Request timed out",
      "Operation TIMEOUT after 5s",
      "Request body stream error",
      "operation aborted",
      "stream closed prematurely",
      "Temporarily unavailable",
    ]) {
      expect(isRetryableError(new Error(message))).toBe(true);
    }
  });

  it("does not retry non-transient errors", () => {
    expect(isRetryableError(new Error("validation failed"))).toBe(false);
    expect(isRetryableError(new Error("404 not found"))).toBe(false);
  });
});

describe("retry", () => {
  it("returns the first successful value without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(retry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors up to maxAttempts", async () => {
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("network connection lost"))
      .mockResolvedValueOnce("ok");

    await expect(
      retry(fn, { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
    expect(fn).toHaveBeenNthCalledWith(3, 3);
  });

  it("rethrows immediately on non-retryable errors", async () => {
    const error = new Error("validation failed");
    const fn = vi.fn(async () => {
      throw error;
    });

    await expect(retry(fn, { maxAttempts: 5, baseDelayMs: 0 })).rejects.toBe(
      error,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws the last error once maxAttempts is exhausted", async () => {
    const last = new Error("timeout #final");
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(last);

    await expect(
      retry(fn, { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toBe(last);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
