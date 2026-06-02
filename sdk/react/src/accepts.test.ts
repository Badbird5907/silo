import { describe, expect, it, vi } from "vitest";

import { resolveAcceptValue, resolveStaticAcceptValue } from "./accepts";

describe("resolveStaticAcceptValue", () => {
  it("returns the value only when it is a literal string", () => {
    expect(resolveStaticAcceptValue("image/*")).toBe("image/*");
    expect(resolveStaticAcceptValue(["image/png"])).toBeUndefined();
    expect(resolveStaticAcceptValue(() => "image/*")).toBeUndefined();
    expect(resolveStaticAcceptValue(undefined)).toBeUndefined();
  });
});

describe("resolveAcceptValue", () => {
  it("passes strings through unchanged", async () => {
    await expect(resolveAcceptValue("image/png")).resolves.toBe("image/png");
  });

  it("joins string arrays with a comma", async () => {
    await expect(
      resolveAcceptValue(["image/png", "image/jpeg"]),
    ).resolves.toBe("image/png,image/jpeg");
  });

  it("invokes sync functions and normalizes their return shape", async () => {
    const fnString = vi.fn(() => "image/png");
    await expect(resolveAcceptValue(fnString)).resolves.toBe("image/png");
    expect(fnString).toHaveBeenCalledTimes(1);

    const fnArray = vi.fn(() => ["image/png", "image/gif"]);
    await expect(resolveAcceptValue(fnArray)).resolves.toBe(
      "image/png,image/gif",
    );
  });

  it("awaits async functions", async () => {
    await expect(
      resolveAcceptValue(async () => "video/mp4"),
    ).resolves.toBe("video/mp4");
    await expect(
      resolveAcceptValue(async () => ["a/b", "c/d"]),
    ).resolves.toBe("a/b,c/d");
  });

  it("returns undefined when the resolved value is neither string nor array", async () => {
    // Cast through unknown to simulate a misbehaving user-provided function.
    const fn = (() => 42) as unknown as () => string;
    await expect(resolveAcceptValue(fn)).resolves.toBeUndefined();
  });

  it("returns undefined when accept is undefined", async () => {
    await expect(resolveAcceptValue(undefined)).resolves.toBeUndefined();
  });
});
