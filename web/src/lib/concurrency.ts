import "server-only";

// Fixed-size worker pool, not Promise.all(items.map(...)) — that fires every
// call simultaneously, risking an AI Gateway rate-limit cliff under a large
// batch instead of a steady, bounded load. Same pattern as
// upload/[token]/actions.ts's local mapWithConcurrency (TESTS.md DEV-7);
// pulled out here since a second call site (recover draft-message
// generation) makes the duplication worth removing.
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await run(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
