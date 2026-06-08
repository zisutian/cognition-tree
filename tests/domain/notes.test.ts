import { describe, expect, it } from "vitest";
import {
  createInitialWorkspace,
  createNoteRecord,
  resolveNoteSyntaxProfile,
  resolveWorkspaceSyntaxProfile,
} from "../../src/domain/notes";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";

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
      defaultCtnSyntaxProfile,
    );

    expect(resolveNoteSyntaxProfile(workspace, note)).toMatchObject({
      profile: { id: "ctn-default" },
      status: "resolved",
    });
    expect(resolveWorkspaceSyntaxProfile(workspace)).toMatchObject({
      profile: { id: "ctn-default" },
      status: "resolved",
    });
    expect("defaultSyntaxProfileId" in workspace.tree[0]).toBe(false);
  });

  it("reports missing syntax profiles without falling back", () => {
    const workspace = {
      ...createInitialWorkspace(),
      defaultSyntaxProfileId: "missing-default",
      syntaxProfiles: [],
    };
    const note = {
      ...createNoteRecord(
        "note-new",
        "",
        "2026-05-25T00:00:00.000Z",
        defaultCtnSyntaxProfile,
      ),
      syntaxProfileId: "missing-note",
    };

    expect(resolveWorkspaceSyntaxProfile(workspace)).toMatchObject({
      status: "missing-profile",
      syntaxProfileId: "missing-default",
    });
    expect(resolveNoteSyntaxProfile(workspace, note)).toMatchObject({
      status: "missing-profile",
      syntaxProfileId: "missing-note",
    });
  });
});
