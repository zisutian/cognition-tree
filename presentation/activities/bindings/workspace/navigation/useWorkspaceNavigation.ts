import { useCallback, useRef, useState } from "react";
import type { WorkspaceStructureIndex } from "../../../../../core/workspace/indexes/workspaceStructureIndex";
import { findWorkspaceNote } from "../../../../../core/workspace/queries/workspaceQueries";
import type { UiEditorFocusTarget } from "../../../../../application/workspace/projection/viewEditor";
import type { UiSyntaxFocusTarget } from "../../../../../application/workspace/projection/viewSyntax";
import type { UiSyntaxFieldId } from "../../../../../application/workspace/projection/viewSyntaxFields";
import type { UiNoteId } from "../../../../../application/workspace/projection/viewTree";
import type { WorkspaceSelection } from "../selection/useWorkspaceSelection";
import type { WorkspaceParseIndex } from "../../../../../core/workspace/indexes/workspaceParseIndex";
import {
  findCtnEditableBlockLineNumber,
} from "../../../../../core/ctn/analysis/editableProjection";

export type WorkspaceNoteFocusRequest = UiEditorFocusTarget & {
  noteId: UiNoteId;
};

export type WorkspaceSyntaxFocusRequest = UiSyntaxFocusTarget;

export type WorkspacePortableNameTarget =
  | { entity: "folder"; folderId: string }
  | { entity: "note"; noteId: UiNoteId };

export function useWorkspaceNavigation({
  analysisIndex,
  selection,
  workspace,
}: {
  analysisIndex: WorkspaceParseIndex | null;
  selection: WorkspaceSelection;
  workspace: WorkspaceStructureIndex;
}) {
  const nextRequestIdRef = useRef(1);
  const [noteFocusRequest, setNoteFocusRequest] =
    useState<WorkspaceNoteFocusRequest | null>(null);
  const [syntaxFocusRequest, setSyntaxFocusRequest] =
    useState<WorkspaceSyntaxFocusRequest | null>(null);
  const nextRequestId = useCallback(() => {
    const requestId = nextRequestIdRef.current;
    nextRequestIdRef.current += 1;
    return requestId;
  }, []);
  const openNoteLine = useCallback(
    (noteId: UiNoteId, lineNumber: number) => {
      if (!findWorkspaceNote(workspace, noteId)) {
        return;
      }

      selection.selectNote(noteId);
      setNoteFocusRequest({
        lineNumber,
        noteId,
        requestId: nextRequestId(),
      });
    },
    [nextRequestId, selection.selectNote, workspace],
  );
  const focusActiveNoteLine = useCallback(
    (lineNumber: number) => {
      if (selection.activeNoteId) {
        openNoteLine(selection.activeNoteId, lineNumber);
      }
    },
    [openNoteLine, selection.activeNoteId],
  );
  const openNoteBlock = useCallback(
    (noteId: UiNoteId, blockId: string | null) => {
      if (!blockId) {
        openNoteLine(noteId, 1);
        return true;
      }
      const parsed = analysisIndex?.getParsedNote(noteId);
      const lineNumber = parsed
        ? findCtnEditableBlockLineNumber(
            parsed.analysis,
            blockId,
            "document",
          )
        : null;

      openNoteLine(noteId, lineNumber ?? 1);
      return lineNumber !== null;
    },
    [analysisIndex, openNoteLine],
  );
  const openPortableName = useCallback(
    (target: WorkspacePortableNameTarget) => {
      if (target.entity === "note") {
        if (findWorkspaceNote(workspace, target.noteId)) {
          selection.selectNote(target.noteId);
        }
        return;
      }
      if (workspace.folderEntryById.has(target.folderId)) {
        selection.selectFolder(target.folderId);
      }
    },
    [selection.selectFolder, selection.selectNote, workspace],
  );
  const openSyntaxField = useCallback(
    (syntaxFileId: string, fieldId: UiSyntaxFieldId) => {
      setSyntaxFocusRequest({
        fieldId,
        requestId: nextRequestId(),
        syntaxFileId,
      });
    },
    [nextRequestId],
  );
  const consumeNoteFocusRequest = useCallback((requestId: number) => {
    setNoteFocusRequest((current) =>
      current?.requestId === requestId ? null : current,
    );
  }, []);
  const consumeSyntaxFocusRequest = useCallback((requestId: number) => {
    setSyntaxFocusRequest((current) =>
      current?.requestId === requestId ? null : current,
    );
  }, []);
  return {
    consumeNoteFocusRequest,
    consumeSyntaxFocusRequest,
    focusActiveNoteLine,
    noteFocusRequest,
    openNoteBlock,
    openNoteLine,
    openPortableName,
    openSyntaxField,
    syntaxFocusRequest,
  };
}

export type WorkspaceNavigation = ReturnType<typeof useWorkspaceNavigation>;
