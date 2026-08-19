import { describe, expect, it } from "vitest";
import {
  readCanonicalTestDocument,
} from "../../ctn/analysis/analysisTestHelpers";
import { replaceCtnSourceTitle } from "../../../../core/ctn/metadata/sourceMetadata";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax";
import { analyzeCtnSource } from "../../../../core/ctn/analysis/sourceAnalysis";
import {
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  moveWorkspaceTreeNode,
  renameWorkspaceFolder,
  renameWorkspaceNote,
  updateWorkspaceRawNoteSource,
  updateWorkspaceNoteSource,
} from "../../../../core/workspace/commands/workspaceCommands";
import { collectWorkspaceTitleBlockIds } from "../../../../core/workspace/context/workspaceBlockMetadata";
import { createWorkspaceParseIndex } from "../../../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";
import { createNoteTreeFolderNode } from "../../../../core/workspace/model/noteTree/create";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../../core/workspace/model/noteTree/mutations";
import {
  createInitialWorkspaceData,
  readWorkspaceNoteHeader,
  type NoteRecord,
  type NoteTreeNode,
  type WorkspaceData,
} from "../../../../core/workspace/model/workspaceData";
import {
  createCanonicalTestNote,
  createWorkspaceTestBlockId,
  readEditableTestSource,
} from "../workspaceTestFixture";

function collectReservedBlockIds(
  workspace: WorkspaceData,
  syntax: typeof defaultCtnSyntax | null,
) {
  if (!syntax) {
    return collectWorkspaceTitleBlockIds(workspace);
  }
  return createWorkspaceParseIndex({
    syntax,
    workspace: createWorkspaceStructureIndex(workspace),
  }).blockIds;
}

const timestamp = "2026-07-16T00:00:00.000Z";
const nextTimestamp = "2026-07-16T01:00:00.000Z";

function createWorkspaceWithNotes(): WorkspaceData {
  const firstNote = createCanonicalTestNote("note-first", "第一篇", {
    timestamp,
  });
  const secondNote = createCanonicalTestNote("note-second", "第二篇", {
    idOffset: 100,
    timestamp,
  });
  const workspace = createInitialWorkspaceData();

  return {
    ...workspace,
    notes: [firstNote, secondNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, firstNote.id, null),
      secondNote.id,
      null,
    ),
  };
}

function analyzeWorkspaceNote(
  workspace: WorkspaceData,
  noteId: string,
) {
  const note = workspace.notes.find(({ id }) => id === noteId);

  if (!note) throw new Error(`Missing workspace test note: ${noteId}`);
  return analyzeCtnSource({
    mode: { kind: "canonical-document" },
    source: note.source,
    syntax: defaultCtnSyntax,
  });
}

function indexWorkspace(workspace: WorkspaceData) {
  return createWorkspaceStructureIndex(workspace);
}

function findFolderIdContainingNote(workspace: WorkspaceData, noteId: string) {
  return indexWorkspace(workspace).noteEntryById.get(noteId)?.parentFolderId ?? null;
}

function sourceChange(note: NoteRecord, source: string) {
  const previous = readEditableTestSource(note.source);

  return {
    edits: [{ from: 0, insertedText: source, to: previous.length }],
    source,
  };
}

function nodeIdentity(node: NoteTreeNode) {
  return node.kind === "folder" ? node.folderId : node.noteId;
}

describe("workspace commands", () => {
  it("creates a canonical source-only note in the target folder", () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      tree: appendFolderToWorkspaceTree(
        [],
        createNoteTreeFolderNode("folder-target", "目标"),
        null,
      ),
    };
    const nextWorkspace = createWorkspaceNote(indexWorkspace(workspace), {
      createBlockId: () => createWorkspaceTestBlockId(500),
      noteId: "note-new",
      parentFolderId: "folder-target",
      reservedBlockIds: new Set(),
      syntax: defaultCtnSyntax,
      timestamp,
    });

    expect(nextWorkspace.notes[0]).toEqual({
      id: "note-new",
      source: expect.stringContaining("@ctn-block id="),
    });
    expect(readWorkspaceNoteHeader(nextWorkspace.notes[0])).toEqual({
      createdAt: timestamp,
      title: "未命名笔记",
      updatedAt: timestamp,
    });
    expect(findFolderIdContainingNote(nextWorkspace, "note-new")).toBe(
      "folder-target",
    );
  });

  it("deletes notes without owning active-note selection", () => {
    const workspace = createWorkspaceWithNotes();
    const nextWorkspace = deleteWorkspaceNote(
      indexWorkspace(workspace),
      "note-second",
    );

    expect(nextWorkspace.notes.map((note) => note.id)).toEqual(["note-first"]);
    expect(nextWorkspace.tree).toEqual([
      { kind: "note", noteId: "note-first" },
    ]);
  });

  it("creates, renames and deletes folders with all nested notes", () => {
    const workspace = createWorkspaceWithNotes();
    const withFolder = createWorkspaceFolder(indexWorkspace(workspace), {
      folderId: "folder-target",
      parentFolderId: null,
      title: "  目标  文件夹  ",
    });
    const renamed = renameWorkspaceFolder(
      indexWorkspace(withFolder),
      "folder-target",
      "资料  汇总",
    );
    const moved = moveWorkspaceTreeNode(indexWorkspace(renamed), {
      destination: { folderId: "folder-target", kind: "inside" },
      source: { kind: "note", noteId: "note-second" },
    });
    const deleted = deleteWorkspaceFolder(
      indexWorkspace(moved),
      "folder-target",
    );

    expect(indexWorkspace(renamed).folderEntryById.get("folder-target")?.node.title)
      .toBe("资料 汇总");
    expect(findFolderIdContainingNote(moved, "note-second")).toBe(
      "folder-target",
    );
    expect(deleted.notes.map((note) => note.id)).toEqual(["note-first"]);
    expect(deleted.tree).toEqual([{ kind: "note", noteId: "note-first" }]);
  });

  it("reconciles explicit editable ranges and allocates only new block ids", () => {
    const base = createCanonicalTestNote("note-first", "标题\n概念", {
      timestamp,
    });
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [base],
      tree: [{ kind: "note" as const, noteId: base.id }],
    };
    const previousEditable = readEditableTestSource(base.source);
    const insertedText = "\n\t: 新定义";
    const updated = updateWorkspaceNoteSource(
      indexWorkspace(workspace),
      base.id,
      analyzeWorkspaceNote(workspace, base.id),
      {
        edits: [
          {
            from: previousEditable.length,
            insertedText,
            to: previousEditable.length,
          },
        ],
        source: previousEditable + insertedText,
      },
      nextTimestamp,
      () => createWorkspaceTestBlockId(500),
      collectReservedBlockIds(workspace, defaultCtnSyntax),
    ).workspaceData;
    const parsed = readCanonicalTestDocument(
      updated.notes[0].source,
      defaultCtnSyntax,
    );

    expect(readEditableTestSource(updated.notes[0].source)).toBe(
      "标题\n概念\n\t: 新定义",
    );
    expect(parsed.blocks.map((block) => block.id)).toEqual([
      createWorkspaceTestBlockId(1),
      createWorkspaceTestBlockId(2),
      createWorkspaceTestBlockId(500),
    ]);
    expect(readWorkspaceNoteHeader(updated.notes[0]).updatedAt).toBe(
      nextTimestamp,
    );
  });

  it("treats a whole-source replacement as delete plus new blocks", () => {
    const workspace = createWorkspaceWithNotes();
    const note = workspace.notes[0];
    const updated = updateWorkspaceNoteSource(
      indexWorkspace(workspace),
      note.id,
      analyzeWorkspaceNote(workspace, note.id),
      sourceChange(note, "新标题\n\t: 定义"),
      nextTimestamp,
      (() => {
        let id = 800;
        return () => createWorkspaceTestBlockId(++id);
      })(),
      collectReservedBlockIds(workspace, defaultCtnSyntax),
    ).workspaceData;

    expect(readEditableTestSource(updated.notes[0].source)).toBe(
      "新标题\n\t: 定义",
    );
    expect(readWorkspaceNoteHeader(updated.notes[0])).toMatchObject({
      title: "新标题",
      updatedAt: nextTimestamp,
    });
  });

  it("updates syntax-free raw source while preserving the canonical title header", () => {
    const workspace = createWorkspaceWithNotes();
    const note = workspace.notes[0];
    const insertedText = " raw";
    const updated = updateWorkspaceRawNoteSource(
      indexWorkspace(workspace),
      note.id,
      {
        edits: [{
          from: note.source.length,
          insertedText,
          to: note.source.length,
        }],
        source: note.source + insertedText,
      },
      nextTimestamp,
    );

    expect(updated.notes[0].source).toMatch(/^@ctn-block id=/);
    expect(updated.notes[0].source).toContain("updated=2026-07-16T01:00:00.000Z");
    expect(updated.notes[0].source).toBe(`${note.source}${insertedText}`.replace(
      /updated=[^\s]+/,
      `updated=${nextTimestamp}`,
    ));
    expect(readWorkspaceNoteHeader(updated.notes[0])).toMatchObject({
      title: "第一篇 raw",
      updatedAt: nextTimestamp,
    });
  });

  it("renames the canonical title with a portable canonical name", () => {
    const workspace = createWorkspaceWithNotes();
    const renamed = renameWorkspaceNote(
      indexWorkspace(workspace),
      "note-first",
      "  新  标题  ",
      nextTimestamp,
    );

    expect(readWorkspaceNoteHeader(renamed.notes[0])).toMatchObject({
      title: "新 标题",
      updatedAt: nextTimestamp,
    });
    expect(() => renameWorkspaceNote(
      indexWorkspace(renamed),
      "note-first",
      "bad:title",
      "2026-07-16T02:00:00.000Z",
    )).toThrow("Workspace note title contains unsupported characters");
  });

  it("canonicalizes a changed title before persisting editor source", () => {
    const workspace = createWorkspaceWithNotes();
    const note = workspace.notes[0];
    const updated = updateWorkspaceNoteSource(
      indexWorkspace(workspace),
      note.id,
      analyzeWorkspaceNote(workspace, note.id),
      sourceChange(note, "\tIndented title\n概念"),
      nextTimestamp,
      () => createWorkspaceTestBlockId(900),
      collectReservedBlockIds(workspace, defaultCtnSyntax),
    ).workspaceData;
    const header = readWorkspaceNoteHeader(updated.notes[0]);
    const parsed = readCanonicalTestDocument(
      updated.notes[0].source,
      defaultCtnSyntax,
    );

    expect(updated.notes[0].source).toMatch(/^@ctn-block /);
    expect(header.title).toBe("Indented title");
    expect(parsed.diagnostics).toEqual([]);
  });

  it("rejects a newly invalid title from configured and raw editors", () => {
    const workspace = createWorkspaceWithNotes();
    const note = workspace.notes[0];

    expect(() => updateWorkspaceNoteSource(
      indexWorkspace(workspace),
      note.id,
      analyzeWorkspaceNote(workspace, note.id),
      sourceChange(note, "bad:title\n概念"),
      nextTimestamp,
      () => createWorkspaceTestBlockId(900),
      collectReservedBlockIds(workspace, defaultCtnSyntax),
    )).toThrow("Workspace note title contains unsupported characters");

    const invalidRawSource = replaceCtnSourceTitle(
      note.source,
      "bad:title",
      nextTimestamp,
    );

    expect(() => updateWorkspaceRawNoteSource(
      indexWorkspace(workspace),
      note.id,
      {
        edits: [{
          from: 0,
          insertedText: invalidRawSource,
          to: note.source.length,
        }],
        source: invalidRawSource,
      },
      nextTimestamp,
    )).toThrow("Workspace note title contains unsupported characters");
  });

  it("canonicalizes a changed raw title with portable Unicode and spacing", () => {
    const workspace = createWorkspaceWithNotes();
    const note = workspace.notes[0];
    const proposedSource = replaceCtnSourceTitle(
      note.source,
      "  Cafe\u0301   标题  ",
      nextTimestamp,
    );
    const updated = updateWorkspaceRawNoteSource(
      indexWorkspace(workspace),
      note.id,
      {
        edits: [{
          from: 0,
          insertedText: proposedSource,
          to: note.source.length,
        }],
        source: proposedSource,
      },
      nextTimestamp,
    );

    expect(readWorkspaceNoteHeader(updated.notes[0]).title).toBe("Café 标题");
  });

  it("allows body edits while preserving an unchanged old invalid title", () => {
    const validWorkspace = createWorkspaceWithNotes();
    const invalidNote = createCanonicalTestNote(
      "note-first",
      "旧:标题\n概念",
      { timestamp },
    );
    const workspace = {
      ...validWorkspace,
      notes: [invalidNote, ...validWorkspace.notes.slice(1)],
    };
    const configured = updateWorkspaceNoteSource(
      indexWorkspace(workspace),
      invalidNote.id,
      analyzeWorkspaceNote(workspace, invalidNote.id),
      sourceChange(invalidNote, "旧:标题\n概念已修改"),
      nextTimestamp,
      () => createWorkspaceTestBlockId(900),
      collectReservedBlockIds(workspace, defaultCtnSyntax),
    ).workspaceData;
    const rawSource = `${invalidNote.source}\nraw body`;
    const raw = updateWorkspaceRawNoteSource(
      indexWorkspace(workspace),
      invalidNote.id,
      {
        edits: [{
          from: invalidNote.source.length,
          insertedText: "\nraw body",
          to: invalidNote.source.length,
        }],
        source: rawSource,
      },
      nextTimestamp,
    );

    expect(readWorkspaceNoteHeader(configured.notes[0]).title).toBe("旧:标题");
    expect(readEditableTestSource(configured.notes[0].source)).toContain(
      "概念已修改",
    );
    expect(readWorkspaceNoteHeader(raw.notes[0]).title).toBe("旧:标题");
    expect(raw.notes[0].source).toContain("raw body");
  });

  it("moves sidebar tree nodes without a derived note-node id", () => {
    const workspace = createWorkspaceWithNotes();
    const movedBeforeNote = moveWorkspaceTreeNode(indexWorkspace(workspace), {
      destination: {
        kind: "before",
        target: { kind: "note", noteId: "note-first" },
      },
      source: { kind: "note", noteId: "note-second" },
    });
    const withFolder = createWorkspaceFolder(indexWorkspace(movedBeforeNote), {
      folderId: "folder-target",
      parentFolderId: null,
      title: "目标",
    });
    const movedInsideFolder = moveWorkspaceTreeNode(indexWorkspace(withFolder), {
      destination: { folderId: "folder-target", kind: "inside" },
      source: { kind: "note", noteId: "note-first" },
    });

    expect(movedInsideFolder.tree.map(nodeIdentity)).toEqual([
      "note-second",
      "folder-target",
    ]);
    expect(findFolderIdContainingNote(movedInsideFolder, "note-first")).toBe(
      "folder-target",
    );
  });

  it("rejects missing identities and invalid folder input", () => {
    const workspace = createWorkspaceWithNotes();

    expect(() =>
      createWorkspaceNote(indexWorkspace(workspace), {
        createBlockId: () => createWorkspaceTestBlockId(900),
        noteId: "note-new",
        parentFolderId: "missing-folder",
        reservedBlockIds: collectReservedBlockIds(workspace, null),
        syntax: null,
        timestamp,
      }),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      createWorkspaceFolder(indexWorkspace(workspace), {
        folderId: "folder-target",
        parentFolderId: "missing-folder",
        title: "目标",
      }),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      createWorkspaceFolder(indexWorkspace(workspace), {
        folderId: "folder-target",
        parentFolderId: null,
        title: "   ",
      }),
    ).toThrow("Workspace folder title must not be empty");
    expect(() =>
      renameWorkspaceFolder(indexWorkspace(workspace), "missing-folder", "资料"),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      renameWorkspaceNote(
        indexWorkspace(workspace),
        "missing-note",
        "新标题",
        timestamp,
      ),
    ).toThrow("Workspace note does not exist");
    expect(() => deleteWorkspaceNote(indexWorkspace(workspace), "missing-note"))
      .toThrow("Workspace note does not exist");
    expect(() =>
      deleteWorkspaceFolder(indexWorkspace(workspace), "missing-folder"),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      moveWorkspaceTreeNode(indexWorkspace(workspace), {
        destination: {
          kind: "after",
          target: { kind: "note", noteId: "note-first" },
        },
        source: { kind: "note", noteId: "missing-note" },
      }),
    ).toThrow("Workspace tree node does not exist");
  });
});
