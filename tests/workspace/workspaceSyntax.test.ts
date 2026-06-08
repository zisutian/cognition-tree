import { describe, expect, it } from "vitest";
import { createInitialWorkspace, createNoteRecord } from "../../src/domain/notes";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../src/syntax/types";
import {
  resolveNoteSyntaxProfile,
  resolveWorkspaceDefaultSyntaxProfile,
} from "../../src/workspace/workspaceSyntax";

describe("workspace syntax resolution", () => {
  it("resolves note and workspace syntax profiles without folder config", () => {
    const workspace = createInitialWorkspace([defaultCtnSyntaxProfile]);
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
    expect(resolveWorkspaceDefaultSyntaxProfile(workspace)).toMatchObject({
      profile: { id: "ctn-default" },
      status: "resolved",
    });
    expect("defaultSyntaxProfileId" in workspace.tree[0]).toBe(false);
  });

  it("reports missing syntax profiles without falling back", () => {
    const workspace = {
      ...createInitialWorkspace([defaultCtnSyntaxProfile]),
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

    expect(resolveWorkspaceDefaultSyntaxProfile(workspace)).toMatchObject({
      status: "missing-profile",
      syntaxProfileId: "missing-default",
    });
    expect(resolveNoteSyntaxProfile(workspace, note)).toMatchObject({
      status: "missing-profile",
      syntaxProfileId: "missing-note",
    });
  });

  it("reports invalid profile shape separately from missing profiles", () => {
    const invalidProfile = {
      ...defaultCtnSyntaxProfile,
      inlineRules: undefined,
    } as unknown as CtnSyntaxProfile;
    const note = createNoteRecord(
      "note-new",
      "",
      "2026-05-25T00:00:00.000Z",
      invalidProfile,
    );
    const workspace = {
      ...createInitialWorkspace([invalidProfile]),
      notes: [note],
      syntaxProfiles: [invalidProfile],
    };

    expect(resolveNoteSyntaxProfile(workspace, note)).toMatchObject({
      status: "invalid-profile",
    });
    expect(resolveWorkspaceDefaultSyntaxProfile(workspace)).toMatchObject({
      status: "invalid-profile",
    });
  });
});
