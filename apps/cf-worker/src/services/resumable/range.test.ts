import { describe, expect, it } from "vitest";

import { buildContentRangeHeader, parseContentRangeHeader } from "./range";

describe("resumable range helpers", () => {
  it("parses valid byte ranges", () => {
    expect(parseContentRangeHeader("bytes 5-9/20")).toEqual({
      start: 5,
      end: 9,
      total: 20,
      length: 5,
    });
  });

  it("builds content range headers", () => {
    expect(buildContentRangeHeader({ start: 0, end: 9, total: 10 })).toBe(
      "bytes 0-9/10",
    );
  });

  it("rejects missing and invalid ranges", () => {
    expect(() => parseContentRangeHeader(null)).toThrow(
      "Content-Range header is required",
    );
    expect(() => parseContentRangeHeader("items 0-1/2")).toThrow(
      'Content-Range must use "bytes <start>-<end>/<total>"',
    );
    expect(() => parseContentRangeHeader("bytes 10-9/20")).toThrow(
      "Content-Range has invalid byte positions",
    );
    expect(() => parseContentRangeHeader("bytes 0-10/10")).toThrow(
      "Content-Range has invalid byte positions",
    );
  });
});
