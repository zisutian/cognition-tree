import { describe, expect, it } from "vitest";
import { createEditorValueSyncChange } from "../../src/editor/editorValueSync";

describe("createEditorValueSyncChange", () => {
  it("returns no change for an identical controlled value", () => {
    expect(createEditorValueSyncChange("same", "same")).toBeNull();
  });

  it("inserts canonical metadata without replacing surrounding content", () => {
    const current = "Title\nNew block";
    const metadata = "@ctn-block id=00000000-0000-4000-8000-000000000001 created=2026-07-15T00:00:00.000Z updated=2026-07-15T00:00:00.000Z\n";
    const next = `Title\n${metadata}New block`;

    expect(createEditorValueSyncChange(current, next)).toEqual({
      from: "Title\n".length,
      insert: metadata,
      to: "Title\n".length,
    });
  });

  it("uses the smallest replacement between shared prefix and suffix", () => {
    expect(createEditorValueSyncChange("Title\nOld\nTail", "Title\nNew\nTail"))
      .toEqual({
        from: 6,
        insert: "New",
        to: 9,
      });
  });
});
