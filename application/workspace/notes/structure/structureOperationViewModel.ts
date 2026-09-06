import type { UiStructureOperationView } from "../../projection/viewStructureOperation.ts";
import type { UiNoteId } from "../../projection/viewTree.ts";
import type { WorkspaceDirectoryMutations } from "../../selection/workspaceSelection.ts";
import type { StructureOperationPairSelectionPhase } from "./directorySelection.ts";

export type StructureOperationActivityViewModel =
  UiStructureOperationView &
  WorkspaceDirectoryMutations & {
    indentUnitCount?: number;
    onMoveStructureBlockBetweenNotes: (
      sourceBlockLineNumberValue: string,
      targetPositionValue: string,
    ) => void;
    onMoveStructureBlockWithinNote: (
      sourceBlockLineNumberValue: string,
      targetPositionValue: string,
    ) => void;
    onSelectDirectoryNote: (noteId: UiNoteId) => void;
    onSetMode: (mode: UiStructureOperationView["mode"]) => void;
    onSwapSourceAndTargetNotes: () => void;
    pairSelectionPhase: StructureOperationPairSelectionPhase;
  };
