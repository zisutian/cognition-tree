import { history, undo } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  createEditorValueSyncChange,
  createEditorValueSyncTransaction,
  ctnExternalValueSync,
} from "../../../presentation/editor/editorValueSync";

describe("createEditorValueSyncChange", () => {
  it("returns no change for an identical controlled value", () => {
    expect(createEditorValueSyncChange("same", "same")).toBeNull();
  });

  it("inserts canonical metadata without replacing surrounding content", () => {
    const current = "Title\nNew block";
    const metadata = "@ctn-block id=00000000-0000-4000-8000-000000000001 created=2026-07-15T00:00:00.000Z updated=2026-07-15T00:00:00.000Z\n";
    const next = `Title\n${metadata}New block`;

    expect(createEditorValueSyncChange(current, next)).toEqual({
      from: "Title\n".length,
      insert: metadata,
      to: "Title\n".length,
    });
  });

  it("uses the smallest replacement between shared prefix and suffix", () => {
    expect(createEditorValueSyncChange("Title\nOld\nTail", "Title\nNew\nTail"))
      .toEqual({
        from: 6,
        insert: "New",
        to: 9,
      });
  });

  it("marks controlled synchronization as external and outside undo history", () => {
    const transaction = createEditorValueSyncTransaction("a", "");

    expect(transaction?.changes).toEqual({ from: 0, insert: "", to: 1 });
    expect(transaction?.annotations).toEqual([
      ctnExternalValueSync.of(true),
      Transaction.addToHistory.of(false),
    ]);
  });

  it("does not add an external controlled value to undo history", () => {
    let state = EditorState.create({ doc: "a", extensions: history() });
    const transaction = createEditorValueSyncTransaction("a", "");

    expect(transaction).not.toBeNull();
    state = state.update(transaction!).state;
    const didUndo = undo({
      dispatch: (nextTransaction) => {
        state = nextTransaction.state;
      },
      state,
    });

    expect(didUndo).toBe(false);
    expect(state.doc.toString()).toBe("");
  });

  it("keeps undo history isolated between separately mounted documents", () => {
    let noteA = EditorState.create({ doc: "A", extensions: history() });
    noteA = noteA.update({ changes: { from: 1, insert: " edited" } }).state;
    let noteB = EditorState.create({ doc: "B", extensions: history() });
    const didUndo = undo({
      dispatch: (transaction) => {
        noteB = transaction.state;
      },
      state: noteB,
    });

    expect(noteA.doc.toString()).toBe("A edited");
    expect(didUndo).toBe(false);
    expect(noteB.doc.toString()).toBe("B");
  });
});
