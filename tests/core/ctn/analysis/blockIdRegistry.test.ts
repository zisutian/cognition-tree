import { describe, expect, it } from "vitest";
import {
  createCtnBlockIdRegistry,
  CtnBlockIdConflictError,
  updateCtnBlockIdRegistry,
} from "../../../../core/ctn/analysis/blockIdRegistry";
import {
  analyzeCanonicalTestSource,
} from "./analysisTestHelpers";
import {
  createCanonicalTestSource,
} from "../../workspace/workspaceTestFixture";

function analysis(title: string, idOffset: number) {
  return analyzeCanonicalTestSource(
    createCanonicalTestSource(title, { idOffset }),
  );
}

describe("CTN block id registry deltas", () => {
  it("replaces only changed owners and preserves unchanged owner sets", () => {
    const first = analysis("First", 0);
    const second = analysis("Second", 100);
    const registry = createCtnBlockIdRegistry([
      { analysis: first, ownerId: "first" },
      { analysis: second, ownerId: "second" },
    ]);
    const secondIds = registry.blockIdsByOwner.get("second");
    const nextFirst = analysis("First changed", 200);
    const next = updateCtnBlockIdRegistry(registry, [{
      entry: { analysis: nextFirst, ownerId: "first" },
      ownerId: "first",
    }]);

    expect(next.blockIdsByOwner.get("second")).toBe(secondIds);
    expect(next.blockIdsByOwner.get("first")).not.toBe(
      registry.blockIdsByOwner.get("first"),
    );
    expect(next.ownerByBlockId.get(nextFirst.document.blocks[0]!.id))
      .toBe("first");
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

    expect(moved.ownerByBlockId.get(first.document.blocks[0]!.id))
      .toBe("third");
    expect(() =>
      updateCtnBlockIdRegistry(registry, [{
        entry: { analysis: second, ownerId: "first" },
        ownerId: "first",
      }])
    ).toThrow(CtnBlockIdConflictError);
  });
});
