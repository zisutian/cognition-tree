import { describe, expect, it } from "vitest";
import { resolveStructureOperationDirectorySelection } from "../../../../src/application/workspace/view-model/structureOperationDirectorySelection";

describe("structure operation directory selection", () => {
  it("advances source and target selection as one explicit state machine", () => {
    expect(
      resolveStructureOperationDirectorySelection({
        mode: "betweenNotes",
        noteId: "note-source",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-old-source",
      }),
    ).toEqual({
      kind: "selectSource",
      nextPhase: "selectTarget",
      noteId: "note-source",
    });
    expect(
      resolveStructureOperationDirectorySelection({
        mode: "betweenNotes",
        noteId: "note-target",
        pairSelectionPhase: "selectTarget",
        sourceNoteId: "note-source",
      }),
    ).toEqual({
      kind: "selectTarget",
      nextPhase: "selectSource",
      noteId: "note-target",
    });
  });

  it("rejects the source note as its own target", () => {
    expect(
      resolveStructureOperationDirectorySelection({
        mode: "betweenNotes",
        noteId: "note-source",
        pairSelectionPhase: "selectTarget",
        sourceNoteId: "note-source",
      }),
    ).toBeNull();
  });

  it("selects one structure note without entering pair selection", () => {
    expect(
      resolveStructureOperationDirectorySelection({
        mode: "withinNote",
        noteId: "note-structure",
        pairSelectionPhase: "selectTarget",
        sourceNoteId: "note-source",
      }),
    ).toEqual({
      kind: "selectStructure",
      nextPhase: "selectSource",
      noteId: "note-structure",
    });
  });
});
