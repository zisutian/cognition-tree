import { describe, expect, it } from "vitest";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";
import {
  collectWorkspaceTitleBlockIds,
  validateWorkspaceTitleBlockMetadata,
  WorkspaceBlockMetadataError,
} from "../../../core/workspace/context/workspaceBlockMetadata";
import { createWorkspaceParseIndex } from "../../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import { createInitialWorkspaceData } from "../../../core/workspace/model/workspaceData";
import {
  createCanonicalTestNote,
  createCanonicalTestSource,
  createWorkspaceTestBlockId,
} from "../workspaceTestFixture";

function createParseIndex(
  workspace: ReturnType<typeof createInitialWorkspaceData>,
) {
  return createWorkspaceParseIndex({
    syntax: defaultCtnSyntax,
    workspace: createWorkspaceStructureIndex({
      ...workspace,
      tree: workspace.notes.map((note) => ({
        kind: "note" as const,
        noteId: note.id,
      })),
    }),
  });
}

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
      [...createParseIndex(workspace).blockIds],
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

    expect(() => createParseIndex(workspace)).toThrow(/Duplicate CTN block id/);
  });

  it("treats a syntax-free body as opaque even when it contains an exact reserved directive", () => {
    const first = createCanonicalTestNote("note-a", "A");
    const second = createCanonicalTestNote("note-b", "B", { idOffset: 100 });
    const bodyDirective = first.source.split("\n", 1)[0];
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [first, { ...second, source: `${second.source}\n${bodyDirective}` }],
    };

    expect([...collectWorkspaceTitleBlockIds(workspace)]).toEqual([
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
      validateWorkspaceTitleBlockMetadata(workspace),
    ).toThrow("expected @ctn-block directive");
    expect(() =>
      validateWorkspaceTitleBlockMetadata(workspace)
    ).toThrow(WorkspaceBlockMetadataError);
  });
});
