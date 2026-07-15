import { useCallback, useRef, useState } from "react";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import { findWorkspaceNote } from "../../../workspace/queries/workspaceQueries";
import type { UiEditorFocusTarget } from "../projection/viewEditor";
import type { UiSyntaxFocusTarget } from "../projection/viewSyntax";
import type { UiSyntaxFieldId } from "../projection/viewSyntaxFields";
import type { UiNoteId } from "../projection/viewTree";
import type { WorkspaceSelection } from "../selection/useWorkspaceSelection";

export type WorkspaceNoteFocusRequest = UiEditorFocusTarget & {
  noteId: UiNoteId;
};

export type WorkspaceSyntaxFocusRequest = UiSyntaxFocusTarget;

export function useWorkspaceNavigation({
  selection,
  workspace,
}: {
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
  const openSyntaxField = useCallback(
    (fieldId: UiSyntaxFieldId) => {
      setSyntaxFocusRequest({ fieldId, requestId: nextRequestId() });
    },
    [nextRequestId],
  );

  return {
    focusActiveNoteLine,
    noteFocusRequest,
    openNoteLine,
    openSyntaxField,
    syntaxFocusRequest,
  };
}

export type WorkspaceNavigation = ReturnType<typeof useWorkspaceNavigation>;
