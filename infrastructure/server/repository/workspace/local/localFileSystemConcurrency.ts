// SPDX-License-Identifier: GPL-3.0-or-later

const localFileSystemConcurrency = 32;

export async function mapLocalFileSystemEntries<Item, Result>(
  entries: readonly Item[],
  read: (entry: Item, index: number) => Promise<Result>,
) {
  const results = new Array<Result>(entries.length);
  let failed = false;
  let failure: unknown;
  let nextIndex = 0;
  const workers = Math.min(localFileSystemConcurrency, entries.length);

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (!failed) {
        const index = nextIndex;

        nextIndex += 1;
        if (index >= entries.length) return;
        try {
          results[index] = await read(entries[index]!, index);
        } catch (error) {
          failed = true;
          failure = error;
        }
      }
    }),
  );
  if (failed) throw failure;
  return results;
}
