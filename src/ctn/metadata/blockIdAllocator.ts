import { isCtnBlockId } from "./blockMetadata";

export type CtnBlockIdAllocator = {
  allocate(): string;
  reserve(id: string): void;
};

export function createCtnBlockIdAllocator(
  createId: () => string,
  reservedIds: ReadonlySet<string>,
): CtnBlockIdAllocator {
  const usedIds = new Set<string>();

  for (const id of reservedIds) {
    if (!isCtnBlockId(id)) {
      throw new Error(`Invalid reserved CTN block id: ${id}`);
    }

    usedIds.add(id);
  }

  return {
    allocate() {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const id = createId();

        if (!isCtnBlockId(id)) {
          throw new Error(`Invalid generated CTN block id: ${id}`);
        }

        if (!usedIds.has(id)) {
          usedIds.add(id);
          return id;
        }
      }

      throw new Error("Unable to generate a unique CTN block id.");
    },
    reserve(id) {
      if (!isCtnBlockId(id)) {
        throw new Error(`Invalid reserved CTN block id: ${id}`);
      }

      usedIds.add(id);
    },
  };
}
