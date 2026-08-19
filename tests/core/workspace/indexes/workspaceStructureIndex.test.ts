import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../../core/workspace/model/noteTree/mutations";
import { createNoteTreeFolderNode } from "../../../../core/workspace/model/noteTree/create";
import {
  createInitialWorkspaceData,
  type NoteTreeNode,
} from "../../../../core/workspace/model/workspaceData";
import { createWorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";
import { createCanonicalTestNote } from "../workspaceTestFixture";

function createWorkspaceData() {
  const firstNote = createCanonicalTestNote("note-first", "First", {
    idOffset: 0,
  });
  const secondNote = createCanonicalTestNote("note-second", "Second", {
    idOffset: 100,
  });
  const thirdNote = createCanonicalTestNote("note-third", "Third", {
    idOffset: 200,
  });
  const workspace = createInitialWorkspaceData();
  const treeWithFolders = appendFolderToWorkspaceTree(
    appendFolderToWorkspaceTree(
      workspace.tree,
      createNoteTreeFolderNode("folder-project", "Project"),
      null,
    ),
    createNoteTreeFolderNode("folder-child", "Child"),
    "folder-project",
  );

  return {
    ...workspace,
    notes: [firstNote, secondNote, thirdNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(
        appendNoteToWorkspaceTree(treeWithFolders, firstNote.id, null),
        secondNote.id,
        "folder-project",
      ),
      thirdNote.id,
      "folder-child",
    ),
  };
}

describe("createWorkspaceStructureIndex", () => {
  it("indexes source-only notes, derived headers, folders and parent paths", () => {
    const workspace = createWorkspaceData();
    const index = createWorkspaceStructureIndex(workspace);

    expect(index.data).toBe(workspace);
    expect(index.noteEntryById.get("note-second")).toMatchObject({
      header: { title: "Second" },
      note: { id: "note-second" },
      noteIndex: 1,
      parentFolderId: "folder-project",
      projectedNote: { id: "note-second", title: "Second" },
    });
    expect(index.noteEntryById.get("note-first")?.parentFolderId).toBeNull();
    expect(index.noteEntryById.get("note-third")?.parentFolderId).toBe(
      "folder-child",
    );
    expect(index.folderEntryById.get("folder-project")).toMatchObject({
      node: { folderId: "folder-project", title: "Project" },
      parentFolderId: null,
    });
    expect(index.folderEntryById.get("folder-child")?.parentFolderId).toBe(
      "folder-project",
    );
  });

  it("returns empty lookup results for missing ids", () => {
    const index = createWorkspaceStructureIndex(createWorkspaceData());

    expect(index.noteEntryById.get("missing-note")).toBeUndefined();
    expect(index.folderEntryById.get("missing-folder")).toBeUndefined();
  });

  it("rejects duplicate, unknown and unplaced note identities at the boundary", () => {
    const note = createCanonicalTestNote("note", "Note");

    expect(() =>
      createWorkspaceStructureIndex({
        ...createInitialWorkspaceData(),
        notes: [note, note],
        tree: [{ kind: "note", noteId: note.id }],
      }),
    ).toThrow("Duplicate workspace note id");
    expect(() =>
      createWorkspaceStructureIndex({
        ...createInitialWorkspaceData(),
        notes: [note],
        tree: [{ kind: "note", noteId: "unknown" }],
      }),
    ).toThrow("references unknown note");
    expect(() =>
      createWorkspaceStructureIndex({
        ...createInitialWorkspaceData(),
        notes: [note],
        tree: [],
      }),
    ).toThrow("missing from tree");
    expect(() =>
      createWorkspaceStructureIndex({
        ...createInitialWorkspaceData(),
        notes: [note],
        tree: [
          { kind: "note", noteId: note.id },
          { kind: "note", noteId: note.id },
        ],
      }),
    ).toThrow("places note more than once");
  });

  it("indexes a 10,000-level tree without recursive traversal", () => {
    const note = createCanonicalTestNote("deep-note", "Deep");
    let node: NoteTreeNode = { kind: "note", noteId: note.id };

    for (let depth = 9_999; depth >= 0; depth -= 1) {
      node = {
        children: [node],
        folderId: `folder-${depth}`,
        kind: "folder",
        title: `Folder ${depth}`,
      };
    }

    const index = createWorkspaceStructureIndex({
      ...createInitialWorkspaceData(),
      notes: [note],
      tree: [node],
    });

    expect(index.folderEntryById.size).toBe(10_000);
    expect(index.noteEntryById.get(note.id)?.parentFolderId).toBe(
      "folder-9999",
    );
  });
});
