# @silo-storage/sdk-react

[Read the Docs](https://silo.evanyu.dev/docs/sdk/react)

React SDK for Silo.

## Quick start

```ts
import type { AppFileRouter } from "@/app/api/upload/core";

import { createSiloReact } from "@silo-storage/sdk-react";

export const {
  useUpload,
  useStagedUpload,
  UploadButton,
  UploadDropzone,
  SiloRouterConfigProvider,
} = createSiloReact<AppFileRouter>({
  endpoint: "/api/upload",
});
```

`useUpload` supports:

- `onUploadBegin`
- `onUploadProgress`
- `onComplete` (typed from route `onUploadComplete` output)
- `onError`
- `onUploadAborted`
- `onFileDialogCancel`

Bulk and single uploads:

```ts
const upload = useUpload({ endpoint: "imageUploader" });
await upload.uploadFiles(files, { input: { albumId: "abc" } });
// Optional: tune how many files upload in parallel (default: max parallel)
await upload.uploadFiles(files, { input: { albumId: "abc" }, concurrency: 4 });
// or
await upload.uploadFile(file, { input: { albumId: "abc" } });
// or open a file picker and auto-upload selected files
await upload.beginUpload({ multiple: true, input: { albumId: "abc" } });
```

Staged upload (chat/messaging-style UI):

```ts
const staged = useStagedUpload({
  endpoint: "imageUploader",
  onUploadProgress: (event) => {
    console.log(event.aggregatePercent);
  },
});

await staged.openFilePicker();
await staged.upload();
```

`useStagedUpload` returns:

- `files`
- `openFilePicker`
- `removeFile` / `clearFiles`
- `upload`
- `isUploading`
- `uploadProgress`

Headless components:

- `UploadButton` (unstyled file-picker trigger)
- `UploadDropzone` (unstyled drag-and-drop region)
