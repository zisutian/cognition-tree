import { describe, expect, it } from "vitest";
import {
  createInitialWorkspace,
  createNoteRecord,
  resolveNoteSyntaxProfile,
  resolveWorkspaceSyntaxProfile,
} from "../../src/domain/notes";

describe("note workspace", () => {
  it("keeps note content separate from the repository tree", () => {
    const workspace = createInitialWorkspace();

    expect(workspace.activeNoteId).toBeNull();
    expect(workspace.notes).toEqual([]);
    expect(workspace.tree.map((node) => node.id)).toEqual(["folder-inbox"]);
  });

  it("resolves note and workspace syntax profiles without folder config", () => {
    const workspace = createInitialWorkspace();
    const note = createNoteRecord(
      "note-new",
      "",
      "2026-05-25T00:00:00.000Z",
    );

    expect(resolveNoteSyntaxProfile(workspace, note).id).toBe("ctn-default");
    expect(resolveWorkspaceSyntaxProfile(workspace).id).toBe("ctn-default");
    expect("defaultSyntaxProfileId" in workspace.tree[0]).toBe(false);
  });
});
