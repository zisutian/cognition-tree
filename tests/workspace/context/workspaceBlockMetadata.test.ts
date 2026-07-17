import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";
import {
  collectWorkspaceBlockIds,
  validateWorkspaceBlockMetadata,
  WorkspaceBlockMetadataError,
} from "../../../src/workspace/context/workspaceBlockMetadata";
import { createInitialWorkspaceData } from "../../../src/workspace/model/workspaceData";
import {
  createCanonicalTestNote,
  createCanonicalTestSource,
  createWorkspaceTestBlockId,
} from "../workspaceTestFixture";

describe("workspace block metadata", () => {
  it("collects globally reserved block ids from canonical note sources", () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [
        createCanonicalTestNote("note-a", "A\nRoot"),
        createCanonicalTestNote("note-b", "B", { idOffset: 100 }),
      ],
    };

    expect(
      [...collectWorkspaceBlockIds(workspace, defaultCtnSyntaxProfile)],
    ).toEqual([
      createWorkspaceTestBlockId(1),
      createWorkspaceTestBlockId(2),
      createWorkspaceTestBlockId(101),
    ]);
  });

  it("rejects block ids duplicated across notes", () => {
    const source = createCanonicalTestSource("Title");
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [
        { id: "note-a", source },
        { id: "note-b", source: source.replace("\nTitle", "\nOther") },
      ],
    };

    expect(() =>
      collectWorkspaceBlockIds(workspace, defaultCtnSyntaxProfile)
    ).toThrow(
      WorkspaceBlockMetadataError,
    );
    expect(() =>
      validateWorkspaceBlockMetadata(workspace, defaultCtnSyntaxProfile),
    ).toThrow(WorkspaceBlockMetadataError);
  });

  it("treats a syntax-free body as opaque even when it contains an exact reserved directive", () => {
    const first = createCanonicalTestNote("note-a", "A");
    const second = createCanonicalTestNote("note-b", "B", { idOffset: 100 });
    const bodyDirective = first.source.split("\n", 1)[0];
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [first, { ...second, source: `${second.source}\n${bodyDirective}` }],
    };

    expect([...collectWorkspaceBlockIds(workspace, null)]).toEqual([
      createWorkspaceTestBlockId(1),
      createWorkspaceTestBlockId(101),
    ]);
  });

  it("rejects damaged canonical metadata instead of synthesizing identities", () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [{ id: "note-a", source: "Title" }],
    };

    expect(() =>
      validateWorkspaceBlockMetadata(workspace, defaultCtnSyntaxProfile),
    ).toThrow("expected @ctn-block directive");
  });
});
