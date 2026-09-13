import { describe, expect, it } from "vitest";
import {
  createCtnBlockIdRegistry,
  CtnBlockIdConflictError,
  updateCtnBlockIdRegistry,
} from "../../../../../core/ctn/analysis/blockIdRegistry";
import { analyzeCanonicalTestSource } from "../../../../support/core/ctn/analysis/analysisTestHelpers";
import { createCanonicalTestSource } from "../../../../support/core/workspace/workspaceTestFixture";

function analysis(title: string, idOffset: number) {
  return analyzeCanonicalTestSource(
    createCanonicalTestSource(title, { idOffset }),
  );
}

describe("CTN block id registry deltas", () => {
  it("reuses the registry for text edits that retain every block identity", () => {
    const first = analysis("First\n\t: Original text", 0);
    const second = analysis("Second", 100);
    const registry = createCtnBlockIdRegistry([
      { analysis: first, ownerId: "first" },
      { analysis: second, ownerId: "second" },
    ]);
    const changed = analysis("First\n\t: Updated text", 0);
    const next = updateCtnBlockIdRegistry(registry, [
      {
        entry: { analysis: changed, ownerId: "first" },
        ownerId: "first",
      },
    ]);

    expect(next).toBe(registry);
    expect(next.ownerByBlockId.get(first.document.blocks[1]!.id)).toBe("first");
  });

  it("still rejects repeated block identities when the block count is unchanged", () => {
    const first = analysis("First\n\t: Text", 0);
    const registry = createCtnBlockIdRegistry([
      { analysis: first, ownerId: "first" },
    ]);
    const invalid = {
      ...first,
      document: {
        ...first.document,
        blocks: [first.document.blocks[0]!, first.document.blocks[0]!],
      },
    };
    expect(() =>
      updateCtnBlockIdRegistry(registry, [
        {
          entry: { analysis: invalid, ownerId: "first" },
          ownerId: "first",
        },
      ]),
    ).toThrow(CtnBlockIdConflictError);
    expect(registry.blockIds.size).toBe(2);
  });

  it("replaces only changed owners and preserves unchanged owner sets", () => {
    const first = analysis("First", 0);
    const second = analysis("Second", 100);
    const registry = createCtnBlockIdRegistry([
      { analysis: first, ownerId: "first" },
      { analysis: second, ownerId: "second" },
    ]);
    const secondIds = registry.blockIdsByOwner.get("second");
    const nextFirst = analysis("First changed", 200);
    const next = updateCtnBlockIdRegistry(registry, [
      {
        entry: { analysis: nextFirst, ownerId: "first" },
        ownerId: "first",
      },
    ]);

    expect(next.blockIdsByOwner.get("second")).toBe(secondIds);
    expect(next.blockIdsByOwner.get("first")).not.toBe(
      registry.blockIdsByOwner.get("first"),
    );
    expect(next.ownerByBlockId.get(nextFirst.document.blocks[0]!.id)).toBe(
      "first",
    );
    expect(next.ownerByBlockId.has(first.document.blocks[0]!.id)).toBe(false);
  });

  it("removes all changed owners before checking batch conflicts", () => {
    const first = analysis("First", 0);
    const second = analysis("Second", 100);
    const registry = createCtnBlockIdRegistry([
      { analysis: first, ownerId: "first" },
      { analysis: second, ownerId: "second" },
    ]);
    const moved = updateCtnBlockIdRegistry(registry, [
      { entry: null, ownerId: "first" },
      { entry: { analysis: first, ownerId: "third" }, ownerId: "third" },
    ]);

    expect(moved.ownerByBlockId.get(first.document.blocks[0]!.id)).toBe(
      "third",
    );
    expect(() =>
      updateCtnBlockIdRegistry(registry, [
        {
          entry: { analysis: second, ownerId: "first" },
          ownerId: "first",
        },
      ]),
    ).toThrow(CtnBlockIdConflictError);
  });
});
