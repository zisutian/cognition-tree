import { describe, expect, it } from "vitest";
import { readCanonicalTestDocument } from "../../../ctn/analysis/analysisTestHelpers";
import { defaultCtnSyntaxSource } from "../../../../core/ctn/syntax/defaultSyntax";
import { parseWorkspaceSyntax } from "../../../../core/workspace/context/workspaceSyntax";
import { readWorkspaceNoteHeader } from "../../../../core/workspace/model/workspaceData";
import { createInitialRepositoryContent } from "../../../../application/workspace/session/initialRepository";

describe("initial repository", () => {
  it("creates one source-only canonical note in repository v4", () => {
    const timestamp = "2026-07-15T00:00:00.000Z";
    const content = createInitialRepositoryContent({
      createBlockId: () => "00000000-0000-4000-8000-000000000001",
      createNoteId: () => "note-initial",
      createSyntaxFileId: () =>
        "syntax-00000000-0000-4000-8000-000000000001",
      createWorkspaceId: () => "workspace-independent",
      name: "知识库",
      timestamp,
    });
    const syntax = parseWorkspaceSyntax(content.syntax.files[0]!.source);
    const note = content.workspace.notes[0];
    const document = readCanonicalTestDocument(note.source, syntax.syntax);

    expect(content).toMatchObject({
      schemaVersion: 4,
      syntax: {
        activeFileId: "syntax-00000000-0000-4000-8000-000000000001",
        files: [{
          id: "syntax-00000000-0000-4000-8000-000000000001",
          source: defaultCtnSyntaxSource,
        }],
      },
      workspace: {
        id: "workspace-independent",
        name: "知识库",
        tree: [{ kind: "note", noteId: "note-initial" }],
      },
    });
    expect(Object.keys(note).sort()).toEqual(["id", "source"]);
    expect(readWorkspaceNoteHeader(note)).toEqual({
      createdAt: timestamp,
      title: "未命名笔记",
      updatedAt: timestamp,
    });
    expect(document.blocks[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      metadata: { createdAt: timestamp, updatedAt: timestamp },
    });
  });

  it("rejects an empty repository name instead of applying a hidden default", () => {
    expect(() =>
      createInitialRepositoryContent({
        createBlockId: () => "unused",
        createNoteId: () => "unused",
        createSyntaxFileId: () => "unused",
        createWorkspaceId: () => "unused",
        name: "   ",
        timestamp: "2026-07-15T00:00:00.000Z",
      })
    ).toThrow("Repository name is required");
  });
});
