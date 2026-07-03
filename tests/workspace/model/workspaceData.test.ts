import { describe, expect, it } from "vitest";
import {
  createInitialWorkspaceData,
} from "../../../src/workspace/model/workspaceData";

describe("workspace data", () => {
  it("keeps note content separate from the repository tree", () => {
    const workspace = createInitialWorkspaceData();

    expect(workspace.activeNoteId).toBeNull();
    expect(workspace.notes).toEqual([]);
    expect(workspace.tree.map((node) => node.id)).toEqual(["folder-inbox"]);
  });
});
