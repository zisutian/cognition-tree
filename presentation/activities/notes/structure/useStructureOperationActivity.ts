import { useMemo } from "react";
import { hasWorkspaceNote } from "../../../../core/workspace/index.ts";
import type {
  UiStructureOperationView,
  UiNoteId,
  StructureOperationActivityViewModel,
  WorkspaceBlockTarget,
} from "../../../../application/workspace/index.ts";

import type {
  WorkspaceRuntime,
  WorkspaceSelection,
} from "../../../workspace/index.ts";

import {
  resolveDifferentNoteId,
  resolveStructureOperationDirectorySelection,
  resolveSwappedStructureOperationPair,
  createStructureOperationProjection,
  executeStructureBlockMoveBetweenNotes,
  executeStructureBlockMoveWithinNote,
} from "../../../../application/workspace/index.ts";




import type { StructureOperationState } from "./useStructureOperationState.ts";

export function useStructureOperationActivity({
  repositoryId,
  runtime,
  selection,
  state,
}: {
  repositoryId: string;
  runtime: WorkspaceRuntime;
  selection: WorkspaceSelection;
  state: StructureOperationState;
}): StructureOperationActivityViewModel {
  const {
    analysis,
    commands,
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
    sourceBlockIds: readonly string[],
    target: WorkspaceBlockTarget,
  ) => {
    selection.selectNote(executeStructureBlockMoveBetweenNotes({
      move: commands.moveStructureBlocks,
      sourceBlockIds,
      sourceNoteId: view.sourceNote?.id ?? null,
      targetNoteId: view.targetNote?.id ?? null,
      target,
    }));
  };
  const moveBlockWithinNote = (
    sourceBlockIds: readonly string[],
    target: WorkspaceBlockTarget,
  ) => {
    const noteId = executeStructureBlockMoveWithinNote({
      move: commands.moveStructureBlocks,
      noteId: view.structureNote?.id ?? null,
      sourceBlockIds,
      target,
    });

    setMode("withinNote");
    selection.selectNote(noteId);
  };

  return {
    ...view,
    canMutate: !runtime.readOnly,
    deleteFolder: selection.deleteFolder,
    deleteNote: selection.deleteNote,
    indentUnitCount: index?.syntax.tabDisplayWidth,
    moveTreeNodes: selection.moveTreeNodes,
    onMoveStructureBlockBetweenNotes: moveBlockBetweenNotes,
    onMoveStructureBlockWithinNote: moveBlockWithinNote,
    onSelectDirectoryNote: selectDirectoryNote,
    onSetMode: setOperationMode,
    onSwapSourceAndTargetNotes: swapSourceAndTargetNotes,
    pairSelectionPhase,
    renameFolder: selection.renameFolder,
    renameNote: selection.renameNote,
    repositoryId,
  };
}
