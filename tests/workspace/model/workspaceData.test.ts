import { describe, expect, it } from "vitest";
import {
  createInitialWorkspaceData,
  inferNoteTitle,
} from "../../../src/workspace/model/workspaceData";

describe("workspace data", () => {
  it("keeps note content separate from the repository tree", () => {
    const workspace = createInitialWorkspaceData();

    expect(workspace.notes).toEqual([]);
    expect(workspace.tree).toEqual([]);
  });

  it("infers note titles only from the fixed first source line", () => {
    expect(inferNoteTitle("标题\n\t: 正文")).toBe("标题");
    expect(inferNoteTitle("\n后续正文")).toBe("");
    expect(inferNoteTitle("   \n后续正文")).toBe("");
  });
});
