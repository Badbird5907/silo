import { describe, expect, it } from "vitest";

import {
  detectProjectRouteModeFromPath,
  extractProjectSlug,
  extractProjectSlugFromPath,
  extractProjectSlugFromUrl,
  isValidSlug,
  toProjectScopedPath,
} from "./subdomain";

describe("extractProjectSlug", () => {
  it("returns the subdomain when host ends with the worker domain", () => {
    expect(extractProjectSlug("acme.upload.silo.dev", "upload.silo.dev")).toBe(
      "acme",
    );
  });

  it("strips ports from both host and worker domain", () => {
    expect(
      extractProjectSlug("acme.upload.silo.dev:8787", "upload.silo.dev:8787"),
    ).toBe("acme");
  });

  it("returns null when host does not match the worker domain", () => {
    expect(extractProjectSlug("acme.other.dev", "upload.silo.dev")).toBeNull();
  });

  it("returns null when the host has no subdomain", () => {
    expect(extractProjectSlug("upload.silo.dev", "upload.silo.dev")).toBeNull();
  });
});

describe("extractProjectSlugFromPath", () => {
  it("extracts the slug after /p/", () => {
    expect(extractProjectSlugFromPath("/p/acme/ingest")).toBe("acme");
    expect(extractProjectSlugFromPath("/p/acme")).toBe("acme");
  });

  it("normalizes paths without a leading slash", () => {
    expect(extractProjectSlugFromPath("p/acme/x")).toBe("acme");
  });

  it("returns null for paths missing the /p/ prefix", () => {
    expect(extractProjectSlugFromPath("/ingest")).toBeNull();
    expect(extractProjectSlugFromPath("/")).toBeNull();
  });

  it("returns null when the slug segment is empty", () => {
    expect(extractProjectSlugFromPath("/p/")).toBeNull();
    expect(extractProjectSlugFromPath("/p//foo")).toBeNull();
  });
});

describe("extractProjectSlugFromUrl", () => {
  it("prefers the subdomain when present", () => {
    const url = new URL("https://acme.upload.silo.dev/p/other/ingest");
    expect(extractProjectSlugFromUrl(url, "upload.silo.dev")).toBe("acme");
  });

  it("falls back to the path-based slug", () => {
    const url = new URL("https://upload.silo.dev/p/acme/ingest");
    expect(extractProjectSlugFromUrl(url, "upload.silo.dev")).toBe("acme");
  });

  it("returns null when neither subdomain nor path provide a slug", () => {
    const url = new URL("https://upload.silo.dev/health");
    expect(extractProjectSlugFromUrl(url, "upload.silo.dev")).toBeNull();
  });
});

describe("detectProjectRouteModeFromPath", () => {
  it("detects path mode for /p/<slug> and /p/<slug>/...", () => {
    expect(detectProjectRouteModeFromPath("/p/acme", "acme")).toBe("path");
    expect(detectProjectRouteModeFromPath("/p/acme/ingest", "acme")).toBe(
      "path",
    );
  });

  it("returns subdomain when the slug does not match the path", () => {
    expect(detectProjectRouteModeFromPath("/p/other/ingest", "acme")).toBe(
      "subdomain",
    );
    expect(detectProjectRouteModeFromPath("/ingest", "acme")).toBe("subdomain");
  });
});

describe("toProjectScopedPath", () => {
  it("prefixes /p/<slug> in path mode", () => {
    expect(toProjectScopedPath("/ingest", "acme", "path")).toBe(
      "/p/acme/ingest",
    );
    expect(toProjectScopedPath("ingest", "acme", "path")).toBe(
      "/p/acme/ingest",
    );
  });

  it("returns a normalized path unchanged in subdomain mode", () => {
    expect(toProjectScopedPath("/ingest", "acme", "subdomain")).toBe("/ingest");
    expect(toProjectScopedPath("ingest", "acme", "subdomain")).toBe("/ingest");
  });
});

describe("isValidSlug", () => {
  it("accepts well-formed DNS labels", () => {
    expect(isValidSlug("acme")).toBe(true);
    expect(isValidSlug("a-b-c")).toBe(true);
    expect(isValidSlug("a1b")).toBe(true);
  });

  it("enforces length bounds", () => {
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a".repeat(64))).toBe(false);
    expect(isValidSlug("a".repeat(63))).toBe(true);
  });

  it("rejects leading or trailing hyphens, uppercase, and bad chars", () => {
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
    expect(isValidSlug("ABC")).toBe(false);
    expect(isValidSlug("a_b")).toBe(false);
    expect(isValidSlug("a.b")).toBe(false);
  });
});
