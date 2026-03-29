# React SDK Contract

This document describes the current React SDK contract and how it integrates
with `@silo-storage/sdk-next`, `@silo-storage/sdk-server`, and `@silo-storage/sdk-core`.

## Package boundaries

- `@silo-storage/sdk-core`
  - low-level upload primitives (`createSiloCore`, signed URL/register flow)
  - callback verification utilities
  - dev SSE parser
- `@silo-storage/sdk-server`
  - UploadThing-style router DSL (`createSiloUpload`, `FileRouter`)
  - internal callback metadata envelope (`callbackMetadata.__silo`)
  - callback dispatcher (`handleUploadCallback`)
- `@silo-storage/sdk-next`
  - Next.js route handler adapter (`createRouteHandler`)
  - safe router config extraction (`extractRouterConfig`)
- `@silo-storage/sdk-react`
  - `createSiloReact<TRouter>(...)` factory
  - `useUpload` hook
  - headless `UploadButton`/`UploadDropzone`
  - optional `SiloRouterConfigProvider` for SSR hydration

## Required app endpoints

A React package should call application-owned endpoints that are powered by
`sdk-server`, not directly call internal Silo callback machinery.

- Register action:
  - route middleware runs server-side
  - callback envelope is generated (`__silo`)
  - signed upload URLs + file keys returned to client
- Callback action:
  - signature is verified
  - router `onUploadComplete` is invoked
  - completion result is made available for client `onComplete`
- Await-completion action:
  - client waits for callback completion result by `fileKeyId`

## Callback envelope contract

`callbackMetadata` is internal transport data. It should be owned by the SDK
runtime, not end users.

Envelope shape:

```ts
callbackMetadata: {
  __silo: {
    version: 1;
    routeSlug: string;
  }
}
```

Reserved behavior:

- `__silo` is reserved and must never be user-writable from React APIs.
- Callback dispatch resolves route via `__silo.routeSlug`.

## React API contract

Factory-first usage:

```ts
const {
  useUpload,
  useStagedUpload,
  UploadButton,
  UploadDropzone,
  SiloRouterConfigProvider,
} = createSiloReact<AppFileRouter>({
  endpoint: "/api/upload",
});
```

Hook usage:

```ts
const upload = useUpload({
  endpoint: "imageUploader",
  onUploadBegin(file, fileIndex) {},
  onUploadProgress(event) {},
  onComplete(completions) {}, // typed route output
  onError(error) {},
  onUploadAborted() {},
  onFileDialogCancel() {},
});

await upload.uploadFiles(files, { input: { albumId: "abc" } });
// or:
await upload.uploadFile(file, { input: { albumId: "abc" } });
// or:
await upload.beginUpload({ multiple: true, input: { albumId: "abc" } });

const staged = useStagedUpload({ endpoint: "imageUploader" });
await staged.openFilePicker();
await staged.upload();
```

`useUpload` returns:

- actions: `uploadFiles`, `uploadFile`, `beginUpload`, `abort`, `reset`
- state: `isUploading`, `isIdle`, `progress`, `error`, `result`

`useStagedUpload` returns:

- actions: `openFilePicker`, `removeFile`, `clearFiles`, `upload`, `abort`, `reset`
- state: `files`, `isUploading`, `uploadProgress`, `error`, `result`

Type behavior:

- `endpoint` is constrained to route slug keys from `TRouter`
- `onComplete`/`result` payload is inferred from route `onUploadComplete` return type

## End-to-end flow reference

1. React client requests upload registration for a route slug.
2. App server runs middleware and writes middleware return values to per-file metadata.
3. Upload is performed against signed URL.
4. Silo callback reaches app callback action and dispatches `onUploadComplete`.
5. Client waits on completion action and receives typed `onComplete` payload.
