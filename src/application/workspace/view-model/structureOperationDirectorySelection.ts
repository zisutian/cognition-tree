import type { UiStructureOperationView } from "../projection/viewStructureOperation";
import type { UiNoteId } from "../projection/viewTree";

export type StructureOperationPairSelectionPhase =
  | "selectSource"
  | "selectTarget";

export type StructureOperationDirectorySelection =
  | {
      kind: "selectSource";
      noteId: UiNoteId;
      nextPhase: "selectTarget";
    }
  | {
      kind: "selectTarget";
      noteId: UiNoteId;
      nextPhase: "selectSource";
    }
  | {
      kind: "selectStructure";
      noteId: UiNoteId;
      nextPhase: "selectSource";
    };

export function resolveStructureOperationDirectorySelection({
  mode,
  noteId,
  pairSelectionPhase,
  sourceNoteId,
}: {
  mode: UiStructureOperationView["mode"];
  noteId: UiNoteId;
  pairSelectionPhase: StructureOperationPairSelectionPhase;
  sourceNoteId: UiNoteId;
}): StructureOperationDirectorySelection | null {
  if (mode === "withinNote") {
    return { kind: "selectStructure", nextPhase: "selectSource", noteId };
  }

  if (pairSelectionPhase === "selectSource") {
    return { kind: "selectSource", nextPhase: "selectTarget", noteId };
  }

  return noteId === sourceNoteId
    ? null
    : { kind: "selectTarget", nextPhase: "selectSource", noteId };
}
