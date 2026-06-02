import { describe, expect, it } from "vitest";

import {
  areMimeTypesEquivalent,
  shouldValidateClaimedMimeType,
} from "./file-types";

describe("MIME type validation helpers", () => {
  it("does not treat application/octet-stream as an authoritative claim", () => {
    expect(
      shouldValidateClaimedMimeType(
        "application/octet-stream",
        "text/x-java-source",
      ),
    ).toBe(false);
  });

  it("keeps specific claimed MIME types authoritative", () => {
    expect(
      shouldValidateClaimedMimeType("text/plain", "text/x-java-source"),
    ).toBe(true);
  });

  it("keeps existing equivalence behavior separate from generic claims", () => {
    expect(
      areMimeTypesEquivalent(
        "application/octet-stream",
        "text/x-java-source",
        "HelloWorld.java",
      ),
    ).toBe(false);
    expect(
      areMimeTypesEquivalent(
        "text/x-java-source",
        "text/x-java-source; charset=utf-8",
        "HelloWorld.java",
      ),
    ).toBe(true);
  });
});
