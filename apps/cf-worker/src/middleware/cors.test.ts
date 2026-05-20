import { describe, expect, it } from "vitest";

import { CORS_ALLOW_HEADERS, CORS_EXPOSE_HEADERS } from "./cors";

describe("cors configuration", () => {
  it("allows and exposes Content-Range for uploads", () => {
    expect(CORS_ALLOW_HEADERS).toContain("Content-Range");
    expect(CORS_EXPOSE_HEADERS).toContain("Content-Range");
  });
});
