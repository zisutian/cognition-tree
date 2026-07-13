import { useMemo } from "react";
import type {
  WorkspaceStructureBlockMoveBetweenNotesRequest,
  WorkspaceStructureBlockMoveWithinNoteRequest,
} from "../../../../workspace/commands/structureBlockCommands";
import {
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceTree,
  hasWorkspaceNote,
} from "../../../../workspace/queries/workspaceQueries";
import { createUiBlockNodes } from "../../projection/viewBlocks";
import type { UiStructureOperationView } from "../../projection/viewStructureOperation";
import { createUiNoteTree, type UiNoteId } from "../../projection/viewTree";
import type { WorkspaceRuntime } from "../../runtime/useWorkspaceApplication";
import { useWorkspaceParseIndex } from "../../runtime/useWorkspaceParseIndex";
import type { WorkspaceSelection } from "../../selection/useWorkspaceSelection";
import { resolveDifferentNoteId } from "../../selection/viewSelection";
import { resolveStructureOperationDirectorySelection } from "./directorySelection";
import type { StructureOperationActivityViewModel } from "./structureOperationViewModel";
import { parseUiStructureOperationTargetPosition } from "./targetPosition";
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
    commands,
    defaultSyntaxProfile,
    effectiveContext,
    effectiveNotes,
    effectiveWorkspace,
    parseIndexCache,
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
  const index = useWorkspaceParseIndex(parseIndexCache, effectiveContext);
  const sourceNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, sourceNoteId)
    : null;
  const targetNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, targetNoteId)
    : null;
  const structureNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, structureNoteId)
    : null;
  const sourceParsed = useMemo(
    () => mode === "betweenNotes" && index && sourceNote
      ? getParsedWorkspaceNote(index, sourceNote.id)
      : null,
    [index, mode, sourceNote],
  );
  const targetParsed = useMemo(
    () => mode === "betweenNotes" && index && targetNote
      ? getParsedWorkspaceNote(index, targetNote.id)
      : null,
    [index, mode, targetNote],
  );
  const structureParsed = useMemo(
    () => mode === "withinNote" && index && structureNote
      ? getParsedWorkspaceNote(index, structureNote.id)
      : null,
    [index, mode, structureNote],
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
  const pairNotes = (nextSourceNoteId: UiNoteId, nextTargetNoteId: UiNoteId) => {
    if (
      nextSourceNoteId === nextTargetNoteId ||
      !noteExists(nextSourceNoteId) ||
      !noteExists(nextTargetNoteId)
    ) {
      return;
    }

    setSourceNoteId(nextSourceNoteId);
    setTargetNoteId(nextTargetNoteId);
    setMode("betweenNotes");
    setPairSelectionPhase("selectSource");
  };
  const moveBlockBetweenNotes = (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => {
    if (
      !index ||
      !sourceNote ||
      !targetNote ||
      !sourceBlockLineNumberValue
    ) {
      return;
    }

    const request: WorkspaceStructureBlockMoveBetweenNotesRequest = {
      sourceBlockLineNumber: Number(sourceBlockLineNumberValue),
      sourceNoteId: sourceNote.id,
      targetNoteId: targetNote.id,
      targetPosition: parseUiStructureOperationTargetPosition(
        targetPositionValue,
      ),
    };
    const result = commands.moveStructureBlockBetweenNotes(index, request);

    if (result.status === "moved") {
      selection.selectNote(result.targetNoteId);
    }
  };
  const moveBlockWithinNote = (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => {
    if (!index || !structureNote || !sourceBlockLineNumberValue) {
      return;
    }

    const request: WorkspaceStructureBlockMoveWithinNoteRequest = {
      noteId: structureNote.id,
      sourceBlockLineNumber: Number(sourceBlockLineNumberValue),
      targetPosition: parseUiStructureOperationTargetPosition(
        targetPositionValue,
      ),
    };
    const result = commands.moveStructureBlockWithinNote(index, request);

    if (result.status === "moved") {
      setMode("withinNote");
      selection.selectNote(result.noteId);
    }
  };
  const noteTree = useMemo(
    () => effectiveWorkspace
      ? createUiNoteTree({
          notes: effectiveNotes,
          tree: getWorkspaceTree(effectiveWorkspace),
        })
      : [],
    [effectiveNotes, effectiveWorkspace],
  );
  const sourceBlocks = useMemo(
    () => mode === "betweenNotes"
      ? createUiBlockNodes(sourceParsed?.document.blocks ?? [])
      : [],
    [mode, sourceParsed],
  );
  const sourceRoots = useMemo(
    () => mode === "betweenNotes"
      ? createUiBlockNodes(sourceParsed?.document.roots ?? [])
      : [],
    [mode, sourceParsed],
  );
  const targetRoots = useMemo(
    () => mode === "betweenNotes"
      ? createUiBlockNodes(targetParsed?.document.roots ?? [])
      : [],
    [mode, targetParsed],
  );
  const structureBlocks = useMemo(
    () => mode === "withinNote"
      ? createUiBlockNodes(structureParsed?.document.blocks ?? [])
      : [],
    [mode, structureParsed],
  );
  const structureRoots = useMemo(
    () => mode === "withinNote"
      ? createUiBlockNodes(structureParsed?.document.roots ?? [])
      : [],
    [mode, structureParsed],
  );

  return {
    deleteFolder: selection.deleteFolder,
    deleteNote: selection.deleteNote,
    indentUnitCount:
      effectiveContext?.syntaxProfile.tabDisplayWidth ??
      defaultSyntaxProfile.tabDisplayWidth,
    mode,
    noteTree,
    onMoveStructureBlockBetweenNotes: moveBlockBetweenNotes,
    onMoveStructureBlockWithinNote: moveBlockWithinNote,
    onPairNotesForStructureOperation: pairNotes,
    onSelectDirectoryNote: selectDirectoryNote,
    onSetMode: setOperationMode,
    pairSelectionPhase,
    renameFolder: selection.renameFolder,
    renameNote: selection.renameNote,
    sourceBlocks,
    sourceNote: sourceNote
      ? { id: sourceNote.id, title: sourceNote.title }
      : null,
    sourceNoteId,
    sourceRoots,
    structureBlocks,
    structureNote: structureNote
      ? { id: structureNote.id, title: structureNote.title }
      : null,
    structureNoteId,
    structureRoots,
    targetNote: targetNote
      ? { id: targetNote.id, title: targetNote.title }
      : null,
    targetNoteId,
    targetRoots,
  };
}
