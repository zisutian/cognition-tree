import { describe, expect, it } from "vitest";
import type { WorkspaceRepositoryContentDto } from "../../../contracts/workspace-repository/types";
import { createWorkspaceRepositoryRevision } from "../../../src/storage/repository/workspaceRepositoryRevision";

function createContent(): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 3,
    syntaxSource: null,
    workspace: {
      id: "workspace",
      name: "Notes",
      notes: [
        { id: "note-b", source: "B" },
        { id: "note-a", source: "A" },
      ],
      tree: [
        { kind: "note", noteId: "note-b" },
        { kind: "note", noteId: "note-a" },
      ],
    },
  };
}

describe("createWorkspaceRepositoryRevision", () => {
  it("produces a strict lowercase sha256 remote revision", async () => {
    await expect(createWorkspaceRepositoryRevision(createContent())).resolves.toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
  });

  it("sorts notes by id for canonical encoding", async () => {
    const first = createContent();
    const reorderedNotes: WorkspaceRepositoryContentDto = {
      ...first,
      workspace: {
        ...first.workspace,
        notes: [...first.workspace.notes].reverse(),
      },
    };

    await expect(createWorkspaceRepositoryRevision(first)).resolves.toBe(
      await createWorkspaceRepositoryRevision(reorderedNotes),
    );
  });

  it("preserves user tree order in canonical encoding", async () => {
    const first = createContent();
    const reorderedTree: WorkspaceRepositoryContentDto = {
      ...first,
      workspace: {
        ...first.workspace,
        tree: [...first.workspace.tree].reverse(),
      },
    };

    await expect(createWorkspaceRepositoryRevision(first)).resolves.not.toBe(
      await createWorkspaceRepositoryRevision(reorderedTree),
    );
  });
});
