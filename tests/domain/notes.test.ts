import { describe, expect, it } from "vitest";
import {
  createInitialWorkspace,
} from "../../src/domain/notes";

describe("note workspace", () => {
  it("keeps note content separate from the repository tree", () => {
    const workspace = createInitialWorkspace();

    expect(workspace.activeNoteId).toBeNull();
    expect(workspace.notes).toEqual([]);
    expect(workspace.tree.map((node) => node.id)).toEqual(["folder-inbox"]);
  });
});
