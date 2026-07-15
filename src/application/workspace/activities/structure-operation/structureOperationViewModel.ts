import type { UiStructureOperationView } from "../../projection/viewStructureOperation";
import type { UiNoteId } from "../../projection/viewTree";
import type { WorkspaceDirectoryMutations } from "../../selection/useWorkspaceSelection";
import type { StructureOperationPairSelectionPhase } from "./directorySelection";

export type StructureOperationActivityViewModel =
  UiStructureOperationView &
  WorkspaceDirectoryMutations & {
    indentUnitCount: number;
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
