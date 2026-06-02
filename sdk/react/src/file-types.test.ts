import { describe, expect, it } from "vitest";

import {
  buildAcceptAttribute,
  getRouteFileTypeKeys,
  getRouteMaxFileCount,
  isFileAllowedByRouteFileTypes,
  routeAllowsMultipleFiles,
} from "./file-types";

const fakeFile = (name: string, type: string): File =>
  new File([new Uint8Array(0)], name, { type });

describe("getRouteFileTypeKeys", () => {
  it("returns undefined when the route is missing or has no buckets", () => {
    expect(getRouteFileTypeKeys(undefined, "x")).toBeUndefined();
    expect(getRouteFileTypeKeys(null, "x")).toBeUndefined();
    expect(getRouteFileTypeKeys({}, "x")).toBeUndefined();
    expect(getRouteFileTypeKeys({ x: "not-an-object" }, "x")).toBeUndefined();
  });

  it("extracts keys from a record-style route config", () => {
    const keys = getRouteFileTypeKeys(
      { upload: { image: { maxFileCount: 4 }, pdf: {} } },
      "upload",
    );
    expect(keys).toEqual(expect.arrayContaining(["image", "pdf"]));
    expect(keys).toHaveLength(2);
  });

  it("merges explicit mimeTypes into the key set", () => {
    const keys = getRouteFileTypeKeys(
      {
        upload: {
          image: { mimeTypes: ["image/png", "image/jpeg"] },
        },
      },
      "upload",
    );
    expect(keys).toEqual(
      expect.arrayContaining(["image", "image/png", "image/jpeg"]),
    );
  });

  it("supports array-style route configs", () => {
    const keys = getRouteFileTypeKeys(
      { upload: [{ type: "image" }, { type: "video" }] },
      "upload",
    );
    expect(keys).toEqual(expect.arrayContaining(["image", "video"]));
  });
});

describe("buildAcceptAttribute", () => {
  it("returns undefined when there are no keys", () => {
    expect(buildAcceptAttribute(undefined)).toBeUndefined();
    expect(buildAcceptAttribute([])).toBeUndefined();
  });

  it("returns undefined when 'blob' is present (accept anything)", () => {
    expect(buildAcceptAttribute(["blob"])).toBeUndefined();
    expect(buildAcceptAttribute(["image", "blob"])).toBeUndefined();
  });

  it("expands keys to a comma-separated accept string", () => {
    const result = buildAcceptAttribute(["image"]);
    expect(result).toBeTruthy();
    // image/* wildcard is expected for the image key.
    expect(result).toContain("image/");
  });
});

describe("isFileAllowedByRouteFileTypes", () => {
  it("allows any file when no restriction is configured", () => {
    expect(
      isFileAllowedByRouteFileTypes(fakeFile("a.png", "image/png"), undefined),
    ).toBe(true);
    expect(
      isFileAllowedByRouteFileTypes(fakeFile("a.png", "image/png"), []),
    ).toBe(true);
  });

  it("allows files whose MIME matches an `image` key", () => {
    expect(
      isFileAllowedByRouteFileTypes(fakeFile("a.png", "image/png"), ["image"]),
    ).toBe(true);
  });

  it("rejects files outside the allowed key categories", () => {
    expect(
      isFileAllowedByRouteFileTypes(fakeFile("a.mp4", "video/mp4"), ["image"]),
    ).toBe(false);
  });

  it("falls back to filename-based MIME lookup when File.type is empty", () => {
    expect(
      isFileAllowedByRouteFileTypes(fakeFile("a.png", ""), ["image"]),
    ).toBe(true);
  });

  it("falls back to the `blob` key when no MIME can be determined", () => {
    expect(
      isFileAllowedByRouteFileTypes(fakeFile("unknown.xyzqzq", ""), ["blob"]),
    ).toBe(true);
    expect(
      isFileAllowedByRouteFileTypes(fakeFile("unknown.xyzqzq", ""), ["image"]),
    ).toBe(false);
  });
});

describe("routeAllowsMultipleFiles", () => {
  it("returns undefined when the route is missing", () => {
    expect(routeAllowsMultipleFiles(undefined, "x")).toBeUndefined();
    expect(routeAllowsMultipleFiles({}, "x")).toBeUndefined();
  });

  it("returns true when any bucket has no maxFileCount cap", () => {
    expect(
      routeAllowsMultipleFiles({ upload: { image: {} } }, "upload"),
    ).toBe(true);
  });

  it("returns true when any bucket explicitly allows > 1", () => {
    expect(
      routeAllowsMultipleFiles(
        { upload: { image: { maxFileCount: 5 } } },
        "upload",
      ),
    ).toBe(true);
  });

  it("returns false when every bucket caps at 1", () => {
    expect(
      routeAllowsMultipleFiles(
        { upload: { image: { maxFileCount: 1 }, pdf: { maxFileCount: 1 } } },
        "upload",
      ),
    ).toBe(false);
  });
});

describe("getRouteMaxFileCount", () => {
  it("returns undefined when any bucket is unlimited", () => {
    expect(
      getRouteMaxFileCount(
        { upload: { image: {}, pdf: { maxFileCount: 3 } } },
        "upload",
      ),
    ).toBeUndefined();
  });

  it("returns the maximum cap across all buckets", () => {
    expect(
      getRouteMaxFileCount(
        { upload: { image: { maxFileCount: 2 }, pdf: { maxFileCount: 5 } } },
        "upload",
      ),
    ).toBe(5);
  });

  it("returns undefined when no buckets exist", () => {
    expect(getRouteMaxFileCount(undefined, "x")).toBeUndefined();
    expect(getRouteMaxFileCount({}, "x")).toBeUndefined();
  });
});
