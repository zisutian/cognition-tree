import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { WorkspaceContext } from "../../../workspace/context/workspaceContext";
import type { WorkspaceParseIndex } from "../../../workspace/indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import type {
  FolderId,
  NoteRecord,
} from "../../../workspace/model/workspaceData";
import {
  findWorkspaceFolderIdContainingNote,
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceTree,
  hasWorkspaceNote,
} from "../../../workspace/queries/workspaceQueries";
import type { SessionCommands } from "../session/sessionCommands";
import type { UiStructureOperationView } from "../projection/viewStructureOperation";
import {
  createUiBlockNodes,
} from "../projection/viewBlocks";
import {
  createUiNoteTree,
  type UiNoteId,
} from "../projection/viewTree";
import type {
  WorkspaceStructureBlockMoveBetweenNotesRequest,
  WorkspaceStructureBlockMoveWithinNoteRequest,
} from "../../../workspace/commands/structureBlockCommands";
import { resolveDifferentNoteId } from "./viewSelection";
import { parseUiStructureOperationTargetPosition } from "./structureOperationTargetPosition";

export type StructureOperationViewModel = UiStructureOperationView & {
  onMoveStructureBlockBetweenNotes: (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => void;
  onMoveStructureBlockWithinNote: (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => void;
  onOpenNoteStructure: (noteId: UiNoteId) => void;
  onPairNotesForStructureOperation: (
    sourceNoteId: UiNoteId,
    targetNoteId: UiNoteId,
  ) => void;
  onSelectSourceNote: (noteId: UiNoteId) => void;
  onSelectTargetNote: (noteId: UiNoteId) => void;
  onSelectStructureNote: (noteId: UiNoteId) => void;
  onSetMode: (mode: UiStructureOperationView["mode"]) => void;
};

export function useStructureOperationViewModel({
  commands,
  effectiveActiveNote,
  effectiveContext,
  effectiveNotes,
  effectiveWorkspace,
  index,
  scopeStructureOperation,
  setActiveNoteId,
  setSelectedFolderId,
}: {
  commands: SessionCommands;
  effectiveActiveNote: NoteRecord | null;
  effectiveContext: WorkspaceContext | null;
  effectiveNotes: NoteRecord[];
  effectiveWorkspace: WorkspaceStructureIndex | null;
  index: WorkspaceParseIndex | null;
  scopeStructureOperation: boolean;
  setActiveNoteId: Dispatch<SetStateAction<UiNoteId | null>>;
  setSelectedFolderId: Dispatch<SetStateAction<FolderId | null>>;
}): StructureOperationViewModel {
  const [structureOperationMode, setStructureOperationMode] =
    useState<UiStructureOperationView["mode"]>("betweenNotes");
  const [selectedSourceNoteId, setSelectedSourceNoteId] = useState("");
  const [selectedTargetNoteId, setSelectedTargetNoteId] = useState("");
  const [structureNoteId, setStructureNoteId] = useState("");

  useEffect(() => {
    if (
      selectedSourceNoteId &&
      effectiveWorkspace &&
      hasWorkspaceNote(effectiveWorkspace, selectedSourceNoteId)
    ) {
      return;
    }

    if (
      effectiveActiveNote &&
      effectiveWorkspace &&
      hasWorkspaceNote(effectiveWorkspace, effectiveActiveNote.id)
    ) {
      setSelectedSourceNoteId(effectiveActiveNote.id);
      return;
    }

    setSelectedSourceNoteId(effectiveNotes[0]?.id ?? "");
  }, [
    effectiveActiveNote,
    effectiveNotes,
    effectiveWorkspace,
    selectedSourceNoteId,
  ]);

  useEffect(() => {
    if (
      selectedTargetNoteId &&
      selectedTargetNoteId !== selectedSourceNoteId &&
      effectiveWorkspace &&
      hasWorkspaceNote(effectiveWorkspace, selectedTargetNoteId)
    ) {
      return;
    }

    setSelectedTargetNoteId(
      resolveDifferentNoteId(effectiveNotes, selectedSourceNoteId),
    );
  }, [
    effectiveNotes,
    effectiveWorkspace,
    selectedSourceNoteId,
    selectedTargetNoteId,
  ]);

  useEffect(() => {
    if (
      structureNoteId &&
      effectiveWorkspace &&
      hasWorkspaceNote(effectiveWorkspace, structureNoteId)
    ) {
      return;
    }

    if (
      effectiveActiveNote &&
      effectiveWorkspace &&
      hasWorkspaceNote(effectiveWorkspace, effectiveActiveNote.id)
    ) {
      setStructureNoteId(effectiveActiveNote.id);
      return;
    }

    setStructureNoteId(effectiveNotes[0]?.id ?? "");
  }, [
    effectiveActiveNote,
    effectiveNotes,
    effectiveWorkspace,
    structureNoteId,
  ]);

  const sourceNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, selectedSourceNoteId)
    : null;
  const targetNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, selectedTargetNoteId)
    : null;
  const structureNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, structureNoteId)
    : null;
  const sourceParsed = useMemo(
    () =>
      scopeStructureOperation && structureOperationMode === "betweenNotes" && index && sourceNote
        ? getParsedWorkspaceNote(index, sourceNote.id)
        : null,
    [sourceNote, index, structureOperationMode, scopeStructureOperation],
  );
  const targetParsed = useMemo(
    () =>
      scopeStructureOperation && structureOperationMode === "betweenNotes" && index && targetNote
        ? getParsedWorkspaceNote(index, targetNote.id)
        : null,
    [targetNote, index, structureOperationMode, scopeStructureOperation],
  );
  const structureParsed = useMemo(
    () =>
      scopeStructureOperation && structureOperationMode === "withinNote" && index && structureNote
        ? getParsedWorkspaceNote(index, structureNote.id)
        : null,
    [structureNote, index, structureOperationMode, scopeStructureOperation],
  );
  const moveBlockBetweenNotes = (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => {
    if (
      !index ||
      !effectiveContext ||
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
      targetPosition: parseUiStructureOperationTargetPosition(targetPositionValue),
    };
    const result = commands.moveStructureBlockBetweenNotes(index, request);

    if (result.status !== "moved") {
      return;
    }

    setActiveNoteId(result.targetNoteId);
    setSelectedFolderId(
      findWorkspaceFolderIdContainingNote(
        effectiveContext.workspace,
        result.targetNoteId,
      ) ?? null,
    );
  };
  const moveStructureBlock = (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => {
    if (!index || !structureNote || !sourceBlockLineNumberValue) {
      return;
    }

    const request: WorkspaceStructureBlockMoveWithinNoteRequest = {
      noteId: structureNote.id,
      sourceBlockLineNumber: Number(sourceBlockLineNumberValue),
      targetPosition: parseUiStructureOperationTargetPosition(targetPositionValue),
    };
    const result = commands.moveStructureBlockWithinNote(index, request);

    if (result.status !== "moved") {
      return;
    }

    setStructureOperationMode("withinNote");
    setActiveNoteId(result.noteId);
    setSelectedFolderId(
      effectiveContext
        ? findWorkspaceFolderIdContainingNote(
            effectiveContext.workspace,
            result.noteId,
          ) ?? null
        : null,
    );
  };
  const noteExists = (noteId: UiNoteId) =>
    Boolean(effectiveWorkspace && hasWorkspaceNote(effectiveWorkspace, noteId));
  const resolveTargetNoteId = (sourceNoteId: UiNoteId, targetNoteId: UiNoteId) =>
    targetNoteId && targetNoteId !== sourceNoteId && noteExists(targetNoteId)
      ? targetNoteId
      : resolveDifferentNoteId(effectiveNotes, sourceNoteId);
  const setMode = (mode: UiStructureOperationView["mode"]) => {
    if (mode === "betweenNotes") {
      setSelectedTargetNoteId((currentTargetNoteId) =>
        resolveTargetNoteId(selectedSourceNoteId, currentTargetNoteId),
      );
    }

    setStructureOperationMode(mode);
  };
  const selectSourceNote = (noteId: UiNoteId) => {
    if (!noteExists(noteId)) {
      return;
    }

    setSelectedSourceNoteId(noteId);
    setSelectedTargetNoteId((currentTargetNoteId) =>
      resolveTargetNoteId(noteId, currentTargetNoteId),
    );
    setStructureOperationMode("betweenNotes");
  };
  const selectTargetNote = (noteId: UiNoteId) => {
    if (!noteExists(noteId) || noteId === selectedSourceNoteId) {
      return;
    }

    setSelectedTargetNoteId(noteId);
    setStructureOperationMode("betweenNotes");
  };
  const selectStructureNote = (noteId: UiNoteId) => {
    if (!effectiveWorkspace || !hasWorkspaceNote(effectiveWorkspace, noteId)) {
      return;
    }

    setStructureNoteId(noteId);
    setStructureOperationMode("withinNote");
  };
  const openNoteStructure = selectStructureNote;
  const pairNotesForStructureOperation = (
    sourceNoteId: UiNoteId,
    targetNoteId: UiNoteId,
  ) => {
    if (
      !effectiveWorkspace ||
      sourceNoteId === targetNoteId ||
      !hasWorkspaceNote(effectiveWorkspace, sourceNoteId) ||
      !hasWorkspaceNote(effectiveWorkspace, targetNoteId)
    ) {
      return;
    }

    setSelectedSourceNoteId(sourceNoteId);
    setSelectedTargetNoteId(targetNoteId);
    setStructureOperationMode("betweenNotes");
  };
  const noteTree = useMemo(
    () =>
      scopeStructureOperation && effectiveWorkspace
        ? createUiNoteTree({
            notes: effectiveNotes,
            tree: getWorkspaceTree(effectiveWorkspace),
          })
        : [],
    [effectiveNotes, effectiveWorkspace, scopeStructureOperation],
  );
  const sourceBlocks = useMemo(
    () =>
      scopeStructureOperation && structureOperationMode === "betweenNotes"
        ? createUiBlockNodes(sourceParsed?.document.blocks ?? [])
        : [],
    [structureOperationMode, scopeStructureOperation, sourceParsed],
  );
  const sourceRoots = useMemo(
    () =>
      scopeStructureOperation && structureOperationMode === "betweenNotes"
        ? createUiBlockNodes(sourceParsed?.document.roots ?? [])
        : [],
    [structureOperationMode, scopeStructureOperation, sourceParsed],
  );
  const targetRoots = useMemo(
    () =>
      scopeStructureOperation && structureOperationMode === "betweenNotes"
        ? createUiBlockNodes(targetParsed?.document.roots ?? [])
        : [],
    [structureOperationMode, scopeStructureOperation, targetParsed],
  );
  const structureBlocks = useMemo(
    () =>
      scopeStructureOperation && structureOperationMode === "withinNote"
        ? createUiBlockNodes(structureParsed?.document.blocks ?? [])
        : [],
    [structureOperationMode, scopeStructureOperation, structureParsed],
  );
  const structureRoots = useMemo(
    () =>
      scopeStructureOperation && structureOperationMode === "withinNote"
        ? createUiBlockNodes(structureParsed?.document.roots ?? [])
        : [],
    [structureOperationMode, scopeStructureOperation, structureParsed],
  );

  return {
    mode: structureOperationMode,
    noteTree,
    onMoveStructureBlockBetweenNotes: moveBlockBetweenNotes,
    onMoveStructureBlockWithinNote: moveStructureBlock,
    onOpenNoteStructure: openNoteStructure,
    onPairNotesForStructureOperation: pairNotesForStructureOperation,
    onSelectSourceNote: selectSourceNote,
    onSelectTargetNote: selectTargetNote,
    onSelectStructureNote: selectStructureNote,
    onSetMode: setMode,
    sourceBlocks,
    sourceNote: sourceNote
      ? { id: sourceNote.id, title: sourceNote.title }
      : null,
    sourceNoteId: selectedSourceNoteId,
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
    targetNoteId: selectedTargetNoteId,
    targetRoots,
  };
}
