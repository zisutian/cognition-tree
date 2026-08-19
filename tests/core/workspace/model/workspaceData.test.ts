import { describe, expect, it } from "vitest";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  readWorkspaceNoteHeader,
  replaceWorkspaceNoteSources,
  WorkspaceNoteHeaderError,
} from "../../../../core/workspace/model/workspaceData";
import {
  createCanonicalTestSource,
  workspaceTestTimestamp,
} from "../workspaceTestFixture";

describe("workspace data", () => {
  it("keeps note content separate from the repository tree", () => {
    const workspace = createInitialWorkspaceData();

    expect(workspace.notes).toEqual([]);
    expect(workspace.tree).toEqual([]);
  });

  it("derives the note header only from canonical title metadata", () => {
    const note = createNoteRecord(
      "note-a",
      createCanonicalTestSource("标题\n\t: 正文"),
    );

    expect(note).toEqual({ id: "note-a", source: expect.any(String) });
    expect(readWorkspaceNoteHeader(note)).toEqual({
      createdAt: workspaceTestTimestamp,
      title: "标题",
      updatedAt: workspaceTestTimestamp,
    });
  });

  it("allows an empty canonical title while rejecting damaged metadata", () => {
    expect(
      readWorkspaceNoteHeader({
        id: "empty-title",
        source: createCanonicalTestSource(""),
      }).title,
    ).toBe("");
    expect(() => createNoteRecord("plain", "Plain title")).toThrow(
      WorkspaceNoteHeaderError,
    );
    const indentedTitle = createNoteRecord(
      "indented-title",
      createCanonicalTestSource("\tIndented title"),
    );

    expect(readWorkspaceNoteHeader(indentedTitle).title).toBe(
      "\tIndented title",
    );
  });

  it("replaces note sources through one validated workspace model operation", () => {
    const noteA = createNoteRecord("note-a", createCanonicalTestSource("A"));
    const noteB = createNoteRecord("note-b", createCanonicalTestSource("B"));
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [noteA, noteB],
      tree: [
        { kind: "note" as const, noteId: noteA.id },
        { kind: "note" as const, noteId: noteB.id },
      ],
    };
    const nextSource = createCanonicalTestSource("B2");
    const replaced = replaceWorkspaceNoteSources(workspace, [
      { noteId: noteB.id, source: nextSource },
    ]);

    expect(replaced.notes).toEqual([
      noteA,
      { id: noteB.id, source: nextSource },
    ]);
    expect(replaced.tree).toBe(workspace.tree);
    expect(() => replaceWorkspaceNoteSources(workspace, [
      { noteId: "missing", source: nextSource },
    ])).toThrow("Workspace note does not exist: missing");
    expect(() => replaceWorkspaceNoteSources(workspace, [
      { noteId: noteA.id, source: "damaged" },
    ])).toThrow(WorkspaceNoteHeaderError);
    expect(() => replaceWorkspaceNoteSources(workspace, [
      { noteId: noteA.id, source: noteA.source },
      { noteId: noteA.id, source: noteA.source },
    ])).toThrow("Duplicate workspace note source replacement");
  });
});
