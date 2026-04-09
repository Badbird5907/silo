export interface DownloadStreamResult {
  bytes: number;
  completed: boolean;
}

export interface TrackedDownloadStream {
  body: ReadableStream<Uint8Array> | null;
  completion: Promise<DownloadStreamResult>;
}

export function trackDownloadStream(
  source: ReadableStream<Uint8Array> | null,
): TrackedDownloadStream {
  if (!source) {
    return {
      body: null,
      completion: Promise.resolve({ bytes: 0, completed: true }),
    };
  }

  let bytes = 0;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });

  const completion = source
    .pipeTo(writable)
    .then(() => ({ bytes, completed: true }))
    .catch(() => ({ bytes, completed: false }));

  return {
    body: readable,
    completion,
  };
}
