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
import type { WorkspaceBlockMigrationRequest } from "../../../workspace/commands/blockMigrationCommands";
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
  onPairNotesForMigration: (
    sourceNoteId: UiNoteId,
    targetNoteId: UiNoteId,
  ) => void;
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
  const [migrationSourceNoteId, setMigrationSourceNoteId] = useState("");
  const [migrationTargetNoteId, setMigrationTargetNoteId] = useState("");

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

  const sourceMigrationNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, migrationSourceNoteId)
    : null;
  const targetMigrationNote = effectiveWorkspace
    ? findWorkspaceNote(effectiveWorkspace, migrationTargetNoteId)
    : null;
  const sourceMigrationParsed = useMemo(
    () =>
      scopeMigration && index && sourceMigrationNote
        ? getParsedWorkspaceNote(index, sourceMigrationNote.id)
        : null,
    [sourceMigrationNote, index, scopeMigration],
  );
  const targetMigrationParsed = useMemo(
    () =>
      scopeMigration && index && targetMigrationNote
        ? getParsedWorkspaceNote(index, targetMigrationNote.id)
        : null,
    [targetMigrationNote, index, scopeMigration],
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
      scopeMigration
        ? createUiBlockNodes(sourceMigrationParsed?.document.blocks ?? [])
        : [],
    [scopeMigration, sourceMigrationParsed],
  );
  const sourceMigrationRoots = useMemo(
    () =>
      scopeMigration
        ? createUiBlockNodes(sourceMigrationParsed?.document.roots ?? [])
        : [],
    [scopeMigration, sourceMigrationParsed],
  );
  const targetMigrationRoots = useMemo(
    () =>
      scopeMigration
        ? createUiBlockNodes(targetMigrationParsed?.document.roots ?? [])
        : [],
    [scopeMigration, targetMigrationParsed],
  );

  return {
    noteTree: migrationNoteTree,
    onMoveBlockToPosition: moveMigrationBlock,
    onPairNotesForMigration: pairNotesForMigration,
    sourceBlocks: sourceMigrationBlocks,
    sourceNote: sourceMigrationNote
      ? { id: sourceMigrationNote.id, title: sourceMigrationNote.title }
      : null,
    sourceNoteId: migrationSourceNoteId,
    sourceRoots: sourceMigrationRoots,
    targetNote: targetMigrationNote
      ? { id: targetMigrationNote.id, title: targetMigrationNote.title }
      : null,
    targetNoteId: migrationTargetNoteId,
    targetRoots: targetMigrationRoots,
  };
}
