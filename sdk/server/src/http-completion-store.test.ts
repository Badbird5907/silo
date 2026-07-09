import { describe, expect, it, vi } from "vitest";

import type { CompletionEntry } from "./fetch-route-handler";
import { createHttpCompletionStore } from "./http-completion-store";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const sampleEntry: CompletionEntry = {
  routeSlug: "uploader",
  fileKeyId: "fk_1",
  completedAt: 1_700_000_000_000,
  onUploadCompleteResult: { userId: "u1" },
};

describe("createHttpCompletionStore - set", () => {
  it("POSTs to /api/internal/completion/set with serialized body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await store.set("fk_1", sampleEntry, 60_000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect((url as URL).toString()).toBe(
      "https://api.example.com/api/internal/completion/set",
    );
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      fileKeyId: "fk_1",
      namespace: undefined,
      completion: sampleEntry,
      ttlSeconds: 60,
    });
  });

  it("uses the configured pathPrefix and namespace", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pathPrefix: "/custom/completion",
      namespace: "tenantA",
    });

    await store.set("fk_1", sampleEntry, 1000);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect((url as URL).pathname).toBe("/custom/completion/set");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.namespace).toBe("tenantA");
  });

  it("rounds ttlMs up to seconds and floors at 1", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await store.set("fk_1", sampleEntry, 1_500); // 1.5s -> 2s
    await store.set("fk_2", sampleEntry, 0); // -> 1s minimum
    await store.set("fk_3", sampleEntry, -10); // -> 1s minimum

    const ttls = fetchImpl.mock.calls.map(
      ([, init]) =>
        JSON.parse((init as RequestInit).body as string).ttlSeconds,
    );
    expect(ttls).toEqual([2, 1, 1]);
  });

  it("merges resolved headers with the JSON content-type", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      headers: async () => ({ Authorization: "Bearer t" }),
    });

    await store.set("fk_1", sampleEntry, 1000);
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer t");
  });

  it("throws when the server returns a non-ok status", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("nope", { status: 500, statusText: "boom" }),
    );
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(store.set("fk_1", sampleEntry, 1000)).rejects.toThrow(
      /500.*nope/,
    );
  });
});

describe("createHttpCompletionStore - get", () => {
  it("includes fileKeyId and namespace as query params", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, completion: sampleEntry }),
    );
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      namespace: "tenantA",
    });

    const result = await store.get("fk_1");
    expect(result).toEqual(sampleEntry);

    const [url, init] = fetchImpl.mock.calls[0]!;
    const u = url as URL;
    expect(u.pathname).toBe("/api/internal/completion/get");
    expect(u.searchParams.get("fileKeyId")).toBe("fk_1");
    expect(u.searchParams.get("namespace")).toBe("tenantA");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).cache).toBe("no-store");
  });

  it("returns null on 202 (pending)", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 202 }),
    );
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(store.get("fk_1")).resolves.toBeNull();
  });

  it("returns null when the payload is missing ok or completion", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, completion: sampleEntry }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(store.get("fk_1")).resolves.toBeNull();
    await expect(store.get("fk_1")).resolves.toBeNull();
  });

  it("throws on non-ok non-202 responses", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("bad", { status: 500, statusText: "Server Error" }),
    );
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(store.get("fk_1")).rejects.toThrow(/500/);
  });
});

describe("createHttpCompletionStore - wait", () => {
  it("encodes timeoutMs and clamps to a minimum of 1", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, completion: sampleEntry }),
    );
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await store.wait("fk_1", 5000);
    await store.wait("fk_2", 0);

    const timeouts = fetchImpl.mock.calls.map(([url]) =>
      (url as URL).searchParams.get("timeoutMs"),
    );
    expect(timeouts).toEqual(["5000", "1"]);
  });

  it("returns null on 202", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 202 }),
    );
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(store.wait("fk_1", 1000)).resolves.toBeNull();
  });

  it("returns the parsed completion on success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, completion: sampleEntry }),
    );
    const store = createHttpCompletionStore({
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(store.wait("fk_1", 1000)).resolves.toEqual(sampleEntry);
  });
});

describe("createHttpCompletionStore - URL building", () => {
  it("accepts a URL object as baseUrl", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const store = createHttpCompletionStore({
      baseUrl: new URL("https://api.example.com/"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await store.set("fk_1", sampleEntry, 1000);
    const [url] = fetchImpl.mock.calls[0]!;
    expect((url as URL).toString()).toBe(
      "https://api.example.com/api/internal/completion/set",
    );
  });
});
