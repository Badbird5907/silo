import { describe, expect, it } from "vitest";

import { resolveResumableUploadUrl } from "./transport";

describe("resolveResumableUploadUrl", () => {
  it("appends the upload id before existing query params", () => {
    expect(
      resolveResumableUploadUrl(
        "https://project.example.com/ingest/resumable?fileKeyId=file_1",
        "upload_1",
      ),
    ).toBe(
      "https://project.example.com/ingest/resumable/upload_1?fileKeyId=file_1",
    );
  });

  it("handles trailing slashes", () => {
    expect(
      resolveResumableUploadUrl(
        "https://example.com/p/proj/ingest/resumable/?sig=abc",
        "up/1",
      ),
    ).toBe("https://example.com/p/proj/ingest/resumable/up%2F1?sig=abc");
  });
});
