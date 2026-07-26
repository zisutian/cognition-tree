import { useMemo } from "react";
import { hasWorkspaceNote } from "../../../../../../core/workspace/queries/workspaceQueries";
import type { UiStructureOperationView } from "../../../../../../application/workspace/projection/viewStructureOperation";
import type { UiNoteId } from "../../../../../../application/workspace/projection/viewTree";
import type { WorkspaceRuntime } from "../../runtime/useWorkspaceApplication";
import type { WorkspaceSelection } from "../../selection/useWorkspaceSelection";
import { resolveDifferentNoteId } from "../../../../../../application/workspace/selection/viewSelection";
import {
  resolveStructureOperationDirectorySelection,
  resolveSwappedStructureOperationPair,
} from "../../../../../../application/workspace/activities/structure-operation/directorySelection";
import { createStructureOperationProjection } from "../../../../../../application/workspace/activities/structure-operation/structureOperationProjection";
import type { StructureOperationActivityViewModel } from "../../../../../../application/workspace/activities/structure-operation/structureOperationViewModel";
import {
  executeStructureBlockMoveBetweenNotes,
  executeStructureBlockMoveWithinNote,
} from "../../../../../../application/workspace/activities/structure-operation/structureOperationWorkflow";
import type { StructureOperationState } from "./useStructureOperationState";

export function useStructureOperationActivity({
  runtime,
  selection,
  state,
}: {
  runtime: WorkspaceRuntime;
  selection: WorkspaceSelection;
  state: StructureOperationState;
}): StructureOperationActivityViewModel {
  const {
    analysis,
    commands,
    defaultSyntax,
    effectiveNotes,
    effectiveWorkspace,
  } = runtime;
  const {
    mode,
    pairSelectionPhase,
    setMode,
    setPairSelectionPhase,
    setSourceNoteId,
    setStructureNoteId,
    setTargetNoteId,
    sourceNoteId,
    structureNoteId,
    targetNoteId,
  } = state;
  const index = analysis.index;
  const view = useMemo(
    () => createStructureOperationProjection({
      analysis,
      mode,
      notes: effectiveNotes,
      sourceNoteId,
      structureNoteId,
      targetNoteId,
      workspace: effectiveWorkspace,
    }),
    [
      analysis.index,
      analysis.parsedNotesById,
      effectiveNotes,
      effectiveWorkspace,
      mode,
      sourceNoteId,
      structureNoteId,
      targetNoteId,
    ],
  );
  const noteExists = (noteId: UiNoteId) =>
    Boolean(effectiveWorkspace && hasWorkspaceNote(effectiveWorkspace, noteId));
  const resolveTargetNoteId = (
    nextSourceNoteId: UiNoteId,
    nextTargetNoteId: UiNoteId,
  ) => nextTargetNoteId &&
    nextTargetNoteId !== nextSourceNoteId &&
    noteExists(nextTargetNoteId)
      ? nextTargetNoteId
      : resolveDifferentNoteId(effectiveNotes, nextSourceNoteId);
  const selectSourceNote = (noteId: UiNoteId) => {
    if (!noteExists(noteId)) {
      return;
    }

    setSourceNoteId(noteId);
    setTargetNoteId((currentTargetNoteId) =>
      resolveTargetNoteId(noteId, currentTargetNoteId),
    );
    setMode("betweenNotes");
  };
  const selectTargetNote = (noteId: UiNoteId) => {
    if (!noteExists(noteId) || noteId === sourceNoteId) {
      return;
    }

    setTargetNoteId(noteId);
    setMode("betweenNotes");
  };
  const selectStructureNote = (noteId: UiNoteId) => {
    if (!noteExists(noteId)) {
      return;
    }

    setStructureNoteId(noteId);
    setMode("withinNote");
  };
  const setOperationMode = (nextMode: UiStructureOperationView["mode"]) => {
    if (nextMode === "betweenNotes") {
      setTargetNoteId((currentTargetNoteId) =>
        resolveTargetNoteId(sourceNoteId, currentTargetNoteId),
      );
    }

    setMode(nextMode);
    setPairSelectionPhase("selectSource");
  };
  const selectDirectoryNote = (noteId: UiNoteId) => {
    if (!noteExists(noteId)) {
      return;
    }

    const directorySelection = resolveStructureOperationDirectorySelection({
      mode,
      noteId,
      pairSelectionPhase,
      sourceNoteId,
    });

    if (!directorySelection) {
      return;
    }

    if (directorySelection.kind === "selectSource") {
      selectSourceNote(directorySelection.noteId);
    } else if (directorySelection.kind === "selectTarget") {
      selectTargetNote(directorySelection.noteId);
    } else {
      selectStructureNote(directorySelection.noteId);
    }

    setPairSelectionPhase(directorySelection.nextPhase);
  };
  const swapSourceAndTargetNotes = () => {
    const swappedPair = resolveSwappedStructureOperationPair({
      sourceNoteId,
      targetNoteId,
    });

    if (!swappedPair) {
      return;
    }

    setSourceNoteId(swappedPair.sourceNoteId);
    setTargetNoteId(swappedPair.targetNoteId);
    setMode("betweenNotes");
    setPairSelectionPhase("selectSource");
  };
  const moveBlockBetweenNotes = (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => {
    selection.selectNote(executeStructureBlockMoveBetweenNotes({
      index,
      move: commands.moveStructureBlockBetweenNotes,
      sourceBlockLineNumberValue,
      sourceNoteId: view.sourceNote?.id ?? null,
      targetNoteId: view.targetNote?.id ?? null,
      targetPositionValue,
    }));
  };
  const moveBlockWithinNote = (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => {
    const noteId = executeStructureBlockMoveWithinNote({
      index,
      move: commands.moveStructureBlockWithinNote,
      noteId: view.structureNote?.id ?? null,
      sourceBlockLineNumberValue,
      targetPositionValue,
    });

    setMode("withinNote");
    selection.selectNote(noteId);
  };

  return {
    ...view,
    deleteFolder: selection.deleteFolder,
    deleteNote: selection.deleteNote,
    indentUnitCount:
      index?.syntax.tabDisplayWidth ??
      defaultSyntax.tabDisplayWidth,
    moveTreeNode: selection.moveTreeNode,
    onMoveStructureBlockBetweenNotes: moveBlockBetweenNotes,
    onMoveStructureBlockWithinNote: moveBlockWithinNote,
    onSelectDirectoryNote: selectDirectoryNote,
    onSetMode: setOperationMode,
    onSwapSourceAndTargetNotes: swapSourceAndTargetNotes,
    pairSelectionPhase,
    renameFolder: selection.renameFolder,
    renameNote: selection.renameNote,
  };
}
