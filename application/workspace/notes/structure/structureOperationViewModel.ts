import type { WorkspaceStructureBlockTarget } from "../../../../core/workspace/index.ts";
import type { UiStructureOperationView } from "../../projection/viewStructureOperation.ts";
import type { UiNoteId } from "../../projection/viewTree.ts";
import type { WorkspaceDirectoryMutations } from "../../selection/workspaceSelection.ts";
import type { StructureOperationPairSelectionPhase } from "./directorySelection.ts";

export type StructureOperationActivityViewModel =
  UiStructureOperationView &
  WorkspaceDirectoryMutations & {
    canMutate: boolean;
    indentUnitCount?: number;
    repositoryId: string;
    onMoveStructureBlockBetweenNotes: (
      sourceBlockIds: readonly string[],
      target: WorkspaceStructureBlockTarget,
    ) => void;
    onMoveStructureBlockWithinNote: (
      sourceBlockIds: readonly string[],
      target: WorkspaceStructureBlockTarget,
    ) => void;
    onSelectDirectoryNote: (noteId: UiNoteId) => void;
    onSetMode: (mode: UiStructureOperationView["mode"]) => void;
    onSwapSourceAndTargetNotes: () => void;
    pairSelectionPhase: StructureOperationPairSelectionPhase;
  };
