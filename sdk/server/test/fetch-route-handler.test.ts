import assert from "node:assert/strict";
import test from "node:test";

import { signCallbackPayload } from "../../core/src/index.ts";
import {
  createFetchRouteHandler,
  createHttpCompletionStore,
  createSiloUpload,
} from "../src/index.ts";

function createRouter() {
  const f = createSiloUpload<Request, { userId: string }, { albumId?: string }>();

  return {
    imageUploader: f({
      image: {
        maxFileSize: "8MB",
        maxFileCount: 2,
      },
    })
      .middleware(async ({ context, input }) => ({
        userId: context.userId,
        albumId: input?.albumId ?? null,
      }))
      .onUploadComplete(async ({ metadata, file }) => ({
        uploadedBy: metadata.userId,
        albumId: metadata.albumId,
        fileKeyId: file.fileKeyId,
      })),
  };
}

function createCore(
  registerUploadBatch: (input: Record<string, unknown>) => Promise<unknown>,
) {
  return {
    config: {
      apiBaseUrl: "https://api.silo.test",
      apiKey: "silo_test_key",
      signingSecret: "silo_test_secret",
    },
    registerUploadBatch,
  };
}

async function readJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

test("GET returns client-safe router config", async () => {
  const routeHandler = createFetchRouteHandler({
    router: createRouter(),
    core: createCore(async () => {
      throw new Error("registerUploadBatch should not be called");
    }),
  });

  const response = routeHandler.GET();
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    routerConfig: {
      imageUploader: {
        image: {
          maxFileCount: 2,
          maxFileSize: "8MB",
        },
      },
    },
  });
});

test("POST register succeeds for a known route", async () => {
  let receivedRegisterInput: Record<string, unknown> | undefined;
  const routeHandler = createFetchRouteHandler({
    router: createRouter(),
    core: createCore(async (input) => {
      receivedRegisterInput = input;
      return {
        mode: "production",
        registerResponse: {
          success: true,
          fileKeys: [
            { accessKey: "access_1", fileKeyId: "filekey_1", status: "created" },
          ],
        },
        files: [
          {
            accessKey: "access_1",
            expiresAt: "2030-01-01T00:00:00.000Z",
            fileKeyId: "filekey_1",
            fileName: "hello.png",
            isPublic: false,
            mimeType: "image/png",
            serveImage: true,
            size: 123,
            uploadUrl: "https://upload.silo.test/filekey_1",
            registration: {
              accessKey: "access_1",
              fileKeyId: "filekey_1",
              status: "created",
            },
          },
        ],
      };
    }),
    resolveContext: () => ({ userId: "user_1" }),
  });

  const response = await routeHandler.POST(
    new Request("https://app.test/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        endpoint: "imageUploader",
        input: { albumId: "album_1" },
        files: [
          {
            fileName: "hello.png",
            hash: "hash_1",
            mimeType: "image/png",
            serveImage: true,
            size: 123,
          },
        ],
      }),
    }),
  );
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.endpoint, "imageUploader");
  assert.equal((payload.files as Array<{ fileKeyId: string }>)[0]?.fileKeyId, "filekey_1");
  assert.equal(receivedRegisterInput?.callbackUrl, "https://app.test/api/upload");
  assert.deepEqual(
    (receivedRegisterInput?.files as Array<{ metadata: Record<string, unknown> }>)[0]
      ?.metadata,
    {
      albumId: "album_1",
      userId: "user_1",
    },
  );
});

test("POST register rejects an unknown route slug", async () => {
  const routeHandler = createFetchRouteHandler({
    router: createRouter(),
    core: createCore(async () => {
      throw new Error("registerUploadBatch should not be called");
    }),
  });

  await assert.rejects(
    () =>
      routeHandler.POST(
        new Request("https://app.test/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "register",
            endpoint: "missingRoute",
            files: [{ fileName: "hello.png", size: 123 }],
          }),
        }),
      ),
    /Unknown route endpoint "missingRoute"/,
  );
});

test("POST callback dispatches onUploadComplete and stores completion", async () => {
  const completions: Array<{
    fileKeyId: string;
    ttlMs: number;
    value: {
      onUploadCompleteResult: {
        uploadedBy: string;
      };
    };
  }> = [];
  const routeHandler = createFetchRouteHandler({
    router: createRouter(),
    core: createCore(async () => {
      throw new Error("registerUploadBatch should not be called");
    }),
    resolveContext: () => ({ userId: "user_1" }),
    completionStore: {
      async set(fileKeyId, value, ttlMs) {
        completions.push({ fileKeyId, ttlMs, value });
      },
      async get() {
        return null;
      },
      async wait() {
        return null;
      },
    },
  });

  const callbackBody = JSON.stringify({
    metadata: {
      __silo: {
        routeSlug: "imageUploader",
        version: 1,
      },
      requestId: "req_1",
    },
    data: {
      id: "evt_1",
      type: "upload.completed",
      version: 1,
      occurredAt: "2026-04-22T12:00:00.000Z",
      data: {
        accessKey: "access_1",
        environmentId: "env_1",
        fileId: "file_1",
        fileKeyId: "filekey_1",
        fileName: "hello.png",
        hash: "hash_1",
        metadata: {
          albumId: "album_1",
          userId: "user_1",
        },
        mimeType: "image/png",
        projectId: "project_1",
        size: 123,
      },
    },
  });
  const signed = await signCallbackPayload({
    payload: callbackBody,
    signingSecret: "silo_test_secret",
    timestamp: Math.floor(Date.now() / 1000),
  });

  const response = await routeHandler.POST(
    new Request("https://app.test/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-silo-signature": signed.signature,
      },
      body: callbackBody,
    }),
  );
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal((payload.callback as { status: string }).status, "handled");
  assert.equal(completions.length, 1);
  assert.equal(completions[0]?.fileKeyId, "filekey_1");
  assert.equal(
    completions[0]?.value.onUploadCompleteResult.uploadedBy,
    "user_1",
  );
});

test("POST await-completion returns 202 while pending and 200 when complete", async () => {
  let waitCalls = 0;
  const routeHandler = createFetchRouteHandler({
    router: createRouter(),
    core: createCore(async () => {
      throw new Error("registerUploadBatch should not be called");
    }),
    completionStore: {
      async set() {},
      async get() {
        return null;
      },
      async wait() {
        waitCalls += 1;
        if (waitCalls === 1) {
          return null;
        }
        return {
          completedAt: 123,
          fileKeyId: "filekey_1",
          onUploadCompleteResult: { ok: true },
          routeSlug: "imageUploader",
        };
      },
    },
  });

  const pendingResponse = await routeHandler.POST(
    new Request("https://app.test/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "await-completion",
        fileKeyId: "filekey_1",
      }),
    }),
  );
  const pendingPayload = await readJson(pendingResponse);
  assert.equal(pendingResponse.status, 202);
  assert.deepEqual(pendingPayload, {
    ok: false,
    pending: true,
  });

  const completedResponse = await routeHandler.POST(
    new Request("https://app.test/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "await-completion",
        fileKeyId: "filekey_1",
      }),
    }),
  );
  const completedPayload = await readJson(completedResponse);
  assert.equal(completedResponse.status, 200);
  assert.equal(completedPayload.ok, true);
  assert.deepEqual(completedPayload.completion, {
    completedAt: 123,
    fileKeyId: "filekey_1",
    onUploadCompleteResult: { ok: true },
    routeSlug: "imageUploader",
  });
});

test("callback requests fail when signingSecret is missing", async () => {
  const routeHandler = createFetchRouteHandler({
    router: createRouter(),
    core: {
      config: {
        apiBaseUrl: "https://api.silo.test",
        apiKey: "silo_test_key",
      },
      registerUploadBatch: async () => {
        throw new Error("registerUploadBatch should not be called");
      },
    },
  });

  await assert.rejects(
    () =>
      routeHandler.POST(
        new Request("https://app.test/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-silo-signature": "t=1,v1=bad",
          },
          body: "{}",
        }),
      ),
    /Missing signingSecret for callback verification/,
  );
});

test("development registration returns DEV_STREAM_UNSUPPORTED", async () => {
  const routeHandler = createFetchRouteHandler({
    router: createRouter(),
    core: createCore(async () => ({
      mode: "development",
      response: new Response(null, { status: 200 }),
      stream: new ReadableStream(),
      files: [
        {
          accessKey: "access_1",
          expiresAt: "2030-01-01T00:00:00.000Z",
          fileKeyId: "filekey_1",
          fileName: "hello.png",
          size: 123,
          uploadUrl: "https://upload.silo.test/filekey_1",
        },
      ],
    })),
  });

  const response = await routeHandler.POST(
    new Request("https://app.test/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        endpoint: "imageUploader",
        files: [{ fileName: "hello.png", size: 123 }],
      }),
    }),
  );
  const payload = await readJson(response);

  assert.equal(response.status, 501);
  assert.equal(payload.ok, false);
  assert.equal((payload.error as { code: string }).code, "DEV_STREAM_UNSUPPORTED");
});

test("createHttpCompletionStore handles set, get, wait, and 202 pending", async () => {
  const requests: Array<{
    body: Record<string, unknown> | null;
    method: string | undefined;
    pathname: string;
  }> = [];
  const completionStore = createHttpCompletionStore({
    baseUrl: "https://internal.example.com",
    headers: async () => ({
      Authorization: "Bearer internal",
    }),
    pathPrefix: "/api/v1/completion",
    fetchImpl: async (input, init) => {
      const url = new URL(input);
      requests.push({
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
        method: init?.method,
        pathname: url.pathname,
      });

      if (url.pathname.endsWith("/set")) {
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith("/get")) {
        if (url.searchParams.get("fileKeyId") === "pending") {
          return new Response(null, { status: 202 });
        }
        return Response.json({
          completion: {
            completedAt: 1,
            fileKeyId: "filekey_1",
            onUploadCompleteResult: { ok: true },
            routeSlug: "imageUploader",
          },
          ok: true,
        });
      }
      return Response.json({
        completion: {
          completedAt: 2,
          fileKeyId: "filekey_2",
          onUploadCompleteResult: { ok: true },
          routeSlug: "imageUploader",
        },
        ok: true,
      });
    },
  });

  await completionStore.set(
    "filekey_1",
    {
      completedAt: 1,
      fileKeyId: "filekey_1",
      onUploadCompleteResult: { ok: true },
      routeSlug: "imageUploader",
    },
    2500,
  );
  const pendingResult = await completionStore.get("pending");
  const getResult = await completionStore.get("filekey_1");
  const waitResult = await completionStore.wait("filekey_2", 5000);

  assert.equal(pendingResult, null);
  assert.deepEqual(getResult, {
    completedAt: 1,
    fileKeyId: "filekey_1",
    onUploadCompleteResult: { ok: true },
    routeSlug: "imageUploader",
  });
  assert.deepEqual(waitResult, {
    completedAt: 2,
    fileKeyId: "filekey_2",
    onUploadCompleteResult: { ok: true },
    routeSlug: "imageUploader",
  });
  assert.equal(requests[0]?.pathname, "/api/v1/completion/set");
  assert.equal(requests[0]?.body?.ttlSeconds, 3);
  assert.equal(requests[1]?.pathname, "/api/v1/completion/get");
  assert.equal(requests[2]?.pathname, "/api/v1/completion/get");
  assert.equal(requests[3]?.pathname, "/api/v1/completion/wait");
});
