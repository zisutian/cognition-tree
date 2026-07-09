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
import type { UiMigrationView } from "../projection/viewMigration";
import {
  createUiBlockNodes,
} from "../projection/viewBlocks";
import {
  createUiNoteTree,
  type UiNoteId,
} from "../projection/viewTree";
import {
  getMoveBlockFailureMessage,
  getMoveBlockSuccessMessage,
} from "./migrationMessages";
import type {
  WorkspaceBlockMigrationRequest,
  WorkspaceNoteBlockMoveRequest,
} from "../../../workspace/commands/blockMigrationCommands";
import { resolveDifferentNoteId } from "./viewSelection";
import { parseUiBlockMigrationTargetPosition } from "./migrationTargetPosition";

type MoveBlockActionResult =
  | {
      message: string;
      status: "moved";
    }
  | {
      message: string;
      status: "failed";
    };

export type MigrationViewModel = UiMigrationView & {
  onMoveBlockToPosition: (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => void;
  onMoveStructureBlock: (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => void;
  onOpenNoteStructure: (noteId: UiNoteId) => void;
  onPairNotesForMigration: (
    sourceNoteId: UiNoteId,
    targetNoteId: UiNoteId,
  ) => void;
  onSelectMigrationSourceNote: (noteId: UiNoteId) => void;
  onSelectMigrationTargetNote: (noteId: UiNoteId) => void;
  onSelectStructureNote: (noteId: UiNoteId) => void;
  onSetMigrationMode: (mode: UiMigrationView["mode"]) => void;
};

export function useMigrationViewModel({
  commands,
  effectiveActiveNote,
  effectiveContext,
  effectiveNotes,
  effectiveWorkspace,
  index,
  scopeMigration,
  setActiveNoteId,
  setSelectedFolderId,
}: {
  commands: SessionCommands;
  effectiveActiveNote: NoteRecord | null;
  effectiveContext: WorkspaceContext | null;
  effectiveNotes: NoteRecord[];
  effectiveWorkspace: WorkspaceStructureIndex | null;
  index: WorkspaceParseIndex | null;
  scopeMigration: boolean;
  setActiveNoteId: Dispatch<SetStateAction<UiNoteId | null>>;
  setSelectedFolderId: Dispatch<SetStateAction<FolderId | null>>;
}): MigrationViewModel {
  const [migrationMode, setMigrationModeState] =
    useState<UiMigrationView["mode"]>("pair");
  const [migrationSourceNoteId, setMigrationSourceNoteId] = useState("");
  const [migrationTargetNoteId, setMigrationTargetNoteId] = useState("");
  const [structureNoteId, setStructureNoteId] = useState("");

  useEffect(() => {
    if (
      migrationSourceNoteId &&
      effectiveWorkspace &&
      hasWorkspaceNote(effectiveWorkspace, migrationSourceNoteId)
    ) {
      return;
    }

    if (
      effectiveActiveNote &&
      effectiveWorkspace &&
      hasWorkspaceNote(effectiveWorkspace, effectiveActiveNote.id)
    ) {
      setMigrationSourceNoteId(effectiveActiveNote.id);
      return;
    }

    setMigrationSourceNoteId(effectiveNotes[0]?.id ?? "");
  }, [
    effectiveActiveNote,
    effectiveNotes,
    effectiveWorkspace,
    migrationSourceNoteId,
  ]);

  useEffect(() => {
    if (
      migrationTargetNoteId &&
      migrationTargetNoteId !== migrationSourceNoteId &&
      effectiveWorkspace &&
      hasWorkspaceNote(effectiveWorkspace, migrationTargetNoteId)
    ) {
      return;
    }

    setMigrationTargetNoteId(
      resolveDifferentNoteId(effectiveNotes, migrationSourceNoteId),
    );
  }, [
    effectiveNotes,
    effectiveWorkspace,
    migrationSourceNoteId,
    migrationTargetNoteId,
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

  const sourceMigrationNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, migrationSourceNoteId)
    : null;
  const targetMigrationNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, migrationTargetNoteId)
    : null;
  const structureNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, structureNoteId)
    : null;
  const sourceMigrationParsed = useMemo(
    () =>
      scopeMigration && migrationMode === "pair" && index && sourceMigrationNote
        ? getParsedWorkspaceNote(index, sourceMigrationNote.id)
        : null,
    [sourceMigrationNote, index, migrationMode, scopeMigration],
  );
  const targetMigrationParsed = useMemo(
    () =>
      scopeMigration && migrationMode === "pair" && index && targetMigrationNote
        ? getParsedWorkspaceNote(index, targetMigrationNote.id)
        : null,
    [targetMigrationNote, index, migrationMode, scopeMigration],
  );
  const structureParsed = useMemo(
    () =>
      scopeMigration && migrationMode === "structure" && index && structureNote
        ? getParsedWorkspaceNote(index, structureNote.id)
        : null,
    [structureNote, index, migrationMode, scopeMigration],
  );
  const moveNoteBlock = (
    request: WorkspaceBlockMigrationRequest,
  ): MoveBlockActionResult => {
    if (!index || !effectiveContext) {
      return {
        message: "需要先配置仓库语法。",
        status: "failed",
      };
    }

    const result = commands.moveBlock(index, request);

    if (result.status !== "moved") {
      return {
        message: getMoveBlockFailureMessage(result.reason),
        status: "failed",
      };
    }

    setActiveNoteId(result.targetNoteId);
    setSelectedFolderId(
      findWorkspaceFolderIdContainingNote(
        effectiveContext.workspace,
        result.targetNoteId,
      ) ?? null,
    );

    return {
      message: getMoveBlockSuccessMessage(),
      status: "moved",
    };
  };
  const moveMigrationBlock = (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => {
    if (
      !sourceMigrationNote ||
      !targetMigrationNote ||
      !sourceBlockLineNumberValue
    ) {
      return;
    }

    moveNoteBlock({
      sourceBlockLineNumber: Number(sourceBlockLineNumberValue),
      sourceNoteId: sourceMigrationNote.id,
      targetNoteId: targetMigrationNote.id,
      targetPosition: parseUiBlockMigrationTargetPosition(targetPositionValue),
    });
  };
  const moveStructureBlock = (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => {
    if (!index || !structureNote || !sourceBlockLineNumberValue) {
      return;
    }

    const request: WorkspaceNoteBlockMoveRequest = {
      noteId: structureNote.id,
      sourceBlockLineNumber: Number(sourceBlockLineNumberValue),
      targetPosition: parseUiBlockMigrationTargetPosition(targetPositionValue),
    };
    const result = commands.moveNoteBlock(index, request);

    if (result.status !== "moved") {
      return;
    }

    setMigrationModeState("structure");
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
  const setMigrationMode = (mode: UiMigrationView["mode"]) => {
    if (mode === "pair") {
      setMigrationTargetNoteId((currentTargetNoteId) =>
        resolveTargetNoteId(migrationSourceNoteId, currentTargetNoteId),
      );
    }

    setMigrationModeState(mode);
  };
  const selectMigrationSourceNote = (noteId: UiNoteId) => {
    if (!noteExists(noteId)) {
      return;
    }

    setMigrationSourceNoteId(noteId);
    setMigrationTargetNoteId((currentTargetNoteId) =>
      resolveTargetNoteId(noteId, currentTargetNoteId),
    );
    setMigrationModeState("pair");
  };
  const selectMigrationTargetNote = (noteId: UiNoteId) => {
    if (!noteExists(noteId) || noteId === migrationSourceNoteId) {
      return;
    }

    setMigrationTargetNoteId(noteId);
    setMigrationModeState("pair");
  };
  const selectStructureNote = (noteId: UiNoteId) => {
    if (!effectiveWorkspace || !hasWorkspaceNote(effectiveWorkspace, noteId)) {
      return;
    }

    setStructureNoteId(noteId);
    setMigrationModeState("structure");
  };
  const openNoteStructure = selectStructureNote;
  const pairNotesForMigration = (
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

    setMigrationSourceNoteId(sourceNoteId);
    setMigrationTargetNoteId(targetNoteId);
    setMigrationModeState("pair");
  };
  const migrationNoteTree = useMemo(
    () =>
      scopeMigration && effectiveWorkspace
        ? createUiNoteTree({
            notes: effectiveNotes,
            tree: getWorkspaceTree(effectiveWorkspace),
          })
        : [],
    [effectiveNotes, effectiveWorkspace, scopeMigration],
  );
  const sourceMigrationBlocks = useMemo(
    () =>
      scopeMigration && migrationMode === "pair"
        ? createUiBlockNodes(sourceMigrationParsed?.document.blocks ?? [])
        : [],
    [migrationMode, scopeMigration, sourceMigrationParsed],
  );
  const sourceMigrationRoots = useMemo(
    () =>
      scopeMigration && migrationMode === "pair"
        ? createUiBlockNodes(sourceMigrationParsed?.document.roots ?? [])
        : [],
    [migrationMode, scopeMigration, sourceMigrationParsed],
  );
  const targetMigrationRoots = useMemo(
    () =>
      scopeMigration && migrationMode === "pair"
        ? createUiBlockNodes(targetMigrationParsed?.document.roots ?? [])
        : [],
    [migrationMode, scopeMigration, targetMigrationParsed],
  );
  const structureBlocks = useMemo(
    () =>
      scopeMigration && migrationMode === "structure"
        ? createUiBlockNodes(structureParsed?.document.blocks ?? [])
        : [],
    [migrationMode, scopeMigration, structureParsed],
  );
  const structureRoots = useMemo(
    () =>
      scopeMigration && migrationMode === "structure"
        ? createUiBlockNodes(structureParsed?.document.roots ?? [])
        : [],
    [migrationMode, scopeMigration, structureParsed],
  );

  return {
    mode: migrationMode,
    noteTree: migrationNoteTree,
    onMoveBlockToPosition: moveMigrationBlock,
    onMoveStructureBlock: moveStructureBlock,
    onOpenNoteStructure: openNoteStructure,
    onPairNotesForMigration: pairNotesForMigration,
    onSelectMigrationSourceNote: selectMigrationSourceNote,
    onSelectMigrationTargetNote: selectMigrationTargetNote,
    onSelectStructureNote: selectStructureNote,
    onSetMigrationMode: setMigrationMode,
    sourceBlocks: sourceMigrationBlocks,
    sourceNote: sourceMigrationNote
      ? { id: sourceMigrationNote.id, title: sourceMigrationNote.title }
      : null,
    sourceNoteId: migrationSourceNoteId,
    sourceRoots: sourceMigrationRoots,
    structureBlocks,
    structureNote: structureNote
      ? { id: structureNote.id, title: structureNote.title }
      : null,
    structureNoteId,
    structureRoots,
    targetNote: targetMigrationNote
      ? { id: targetMigrationNote.id, title: targetMigrationNote.title }
      : null,
    targetNoteId: migrationTargetNoteId,
    targetRoots: targetMigrationRoots,
  };
}
