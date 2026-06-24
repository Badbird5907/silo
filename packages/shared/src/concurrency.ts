/**
 * Maps over `items` running at most `concurrency` workers at a time, preserving
 * input order in the returned results array.
 *
 * Useful for fan-out work (DB writes, fetches) that is currently performed in a
 * sequential `for` loop but where each item is independent.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;

      const item = items[currentIndex] as T;
      results[currentIndex] = await worker(item, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));

  return results;
}
