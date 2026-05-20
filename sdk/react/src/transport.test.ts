import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveResumableUploadUrl,
  uploadFileWithProgress,
} from "./transport";

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

describe("uploadFileWithProgress (resumable)", () => {
  const uploadUrl = "https://project.example.com/ingest/resumable";
  const fileContents = new Uint8Array([1, 2, 3, 4, 5]);
  const fileSize = fileContents.byteLength;

  const makeFile = () =>
    new File([fileContents], "test.bin", { type: "application/octet-stream" });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns delivered:true when the worker reports completionDelivered", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ ok: true, uploadId: "u1", offset: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          uploadId: "u1",
          offset: fileSize,
          size: fileSize,
          complete: true,
          completionDelivered: true,
          completion: {
            success: true,
            fileKeyId: "fk1",
            accessKey: "ak1",
            fileId: "f1",
            onUploadCompleteResult: { userId: "abc" },
          },
        }),
      );

    const onProgress = vi.fn();
    const result = await uploadFileWithProgress(
      uploadUrl,
      "resumable",
      makeFile(),
      onProgress,
      new AbortController().signal,
    );

    expect(result).toEqual({
      delivered: true,
      onUploadCompleteResult: { userId: "abc" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns delivered:false in dev mode where result is not propagated inline", async () => {
    // Dev mode: worker callback fires but SDK uses SSE separately, so the
    // worker-side response carries no onUploadCompleteResult. The client
    // must fall back to awaitCompletion which reads from the SSE-fed store.
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ ok: true, uploadId: "u1", offset: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          uploadId: "u1",
          offset: fileSize,
          size: fileSize,
          complete: true,
          completionDelivered: false,
          completion: {
            success: true,
            fileKeyId: "fk1",
            accessKey: "ak1",
            fileId: "f1",
          },
        }),
      );

    const result = await uploadFileWithProgress(
      uploadUrl,
      "resumable",
      makeFile(),
      vi.fn(),
      new AbortController().signal,
    );

    expect(result).toEqual({
      delivered: false,
      onUploadCompleteResult: undefined,
    });
  });

  it("returns delivered:false when completionDelivered is absent", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ ok: true, uploadId: "u1", offset: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          uploadId: "u1",
          offset: fileSize,
          size: fileSize,
          complete: true,
        }),
      );

    const result = await uploadFileWithProgress(
      uploadUrl,
      "resumable",
      makeFile(),
      vi.fn(),
      new AbortController().signal,
    );

    expect(result).toEqual({
      delivered: false,
      onUploadCompleteResult: undefined,
    });
  });

  it("returns delivered:false when completionDelivered is explicitly false", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ ok: true, uploadId: "u1", offset: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          uploadId: "u1",
          offset: fileSize,
          size: fileSize,
          complete: true,
          completionDelivered: false,
        }),
      );

    const result = await uploadFileWithProgress(
      uploadUrl,
      "resumable",
      makeFile(),
      vi.fn(),
      new AbortController().signal,
    );

    expect(result.delivered).toBe(false);
  });

  it("falls back to status GET when no chunk reported complete", async () => {
    const fullFile = new File(
      [new Uint8Array(0)],
      "empty.bin",
      { type: "application/octet-stream" },
    );

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, uploadId: "u1", offset: 0 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          completionDelivered: true,
          completion: { onUploadCompleteResult: { ran: true } },
        }),
      );

    const result = await uploadFileWithProgress(
      uploadUrl,
      "resumable",
      fullFile,
      vi.fn(),
      new AbortController().signal,
    );

    expect(result).toEqual({
      delivered: true,
      onUploadCompleteResult: { ran: true },
    });
  });
});
