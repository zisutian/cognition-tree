import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../../../src/ctn/parser/parseCtnDocument";
import { parseWorkspaceSyntax } from "../../../../src/workspace/context/workspaceSyntax";
import { createInitialRepositoryContent } from "../../../../src/application/workspace/session/initialRepository";

describe("initial repository", () => {
  it("creates one valid metadata-backed note with repository syntax", () => {
    const timestamp = "2026-07-15T00:00:00.000Z";
    const content = createInitialRepositoryContent({
      createBlockId: () => "00000000-0000-4000-8000-000000000001",
      createNoteId: () => "note-initial",
      name: "知识库",
      repositoryId: "knowledge",
      timestamp,
    });
    const syntax = parseWorkspaceSyntax(content.syntaxSourceFile.source);
    const note = content.workspace.notes[0];
    const document = parseCtnDocument(note.source, syntax.profile);

    expect(content.workspace).toMatchObject({
      id: "workspace-knowledge",
      name: "知识库",
    });
    expect(note).toMatchObject({
      createdAt: timestamp,
      id: "note-initial",
      title: "未命名笔记",
      updatedAt: timestamp,
    });
    expect(document.blocks[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      metadata: { createdAt: timestamp, updatedAt: timestamp },
    });
  });
});
