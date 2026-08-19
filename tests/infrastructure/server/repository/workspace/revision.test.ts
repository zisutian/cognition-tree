// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { WorkspaceRepositoryContentDto } from "../../../../../contracts/workspace/types.ts";
import { createWorkspaceRepositoryRevision } from "../../../../../infrastructure/server/repository/workspace/revision.ts";

function createContent(): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 4,
    syntax: {
      activeFileId: "syntax-00000000-0000-4000-8000-000000000001",
      files: [
        {
          id: "syntax-00000000-0000-4000-8000-000000000001",
          source: 'name = "First"\n',
        },
        {
          id: "syntax-00000000-0000-4000-8000-000000000002",
          source: 'name = "Second"\n',
        },
      ],
    },
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
  it("produces a strict lowercase sha256 repository revision", () => {
    expect(createWorkspaceRepositoryRevision(createContent())).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
  });

  it("sorts notes by id for canonical encoding", () => {
    const first = createContent();
    const reorderedNotes: WorkspaceRepositoryContentDto = {
      ...first,
      workspace: {
        ...first.workspace,
        notes: [...first.workspace.notes].reverse(),
      },
    };

    expect(createWorkspaceRepositoryRevision(first)).toBe(
      createWorkspaceRepositoryRevision(reorderedNotes),
    );
  });

  it("preserves user tree order in canonical encoding", () => {
    const first = createContent();
    const reorderedTree: WorkspaceRepositoryContentDto = {
      ...first,
      workspace: {
        ...first.workspace,
        tree: [...first.workspace.tree].reverse(),
      },
    };

    expect(createWorkspaceRepositoryRevision(first)).not.toBe(
      createWorkspaceRepositoryRevision(reorderedTree),
    );
  });

  it("preserves syntax file order in canonical encoding", () => {
    const first = createContent();
    const reorderedSyntax: WorkspaceRepositoryContentDto = {
      ...first,
      syntax: { ...first.syntax, files: [...first.syntax.files].reverse() },
    };

    expect(createWorkspaceRepositoryRevision(first)).not.toBe(
      createWorkspaceRepositoryRevision(reorderedSyntax),
    );
  });

  it("includes the active syntax file and every syntax source", () => {
    const first = createContent();
    const switched: WorkspaceRepositoryContentDto = {
      ...first,
      syntax: {
        ...first.syntax,
        activeFileId: first.syntax.files[1]?.id ?? null,
      },
    };
    const edited: WorkspaceRepositoryContentDto = {
      ...first,
      syntax: {
        ...first.syntax,
        files: first.syntax.files.map((file, index) =>
          index === 1 ? { ...file, source: `${file.source}# edited\n` } : file
        ),
      },
    };

    expect(createWorkspaceRepositoryRevision(first)).not.toBe(
      createWorkspaceRepositoryRevision(switched),
    );
    expect(createWorkspaceRepositoryRevision(first)).not.toBe(
      createWorkspaceRepositoryRevision(edited),
    );
  });
});
