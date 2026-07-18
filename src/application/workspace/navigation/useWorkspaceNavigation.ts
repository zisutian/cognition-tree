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

export type WorkspaceRepositoryIssueFocusRequest = {
  issueId: string;
  requestId: number;
};

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
  const [repositoryIssueFocusRequest, setRepositoryIssueFocusRequest] =
    useState<WorkspaceRepositoryIssueFocusRequest | null>(null);
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
  const openRepositoryIssue = useCallback(
    (issueId: string) => {
      setRepositoryIssueFocusRequest({ issueId, requestId: nextRequestId() });
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
  const consumeRepositoryIssueFocusRequest = useCallback((requestId: number) => {
    setRepositoryIssueFocusRequest((current) =>
      current?.requestId === requestId ? null : current,
    );
  }, []);

  return {
    consumeNoteFocusRequest,
    consumeRepositoryIssueFocusRequest,
    consumeSyntaxFocusRequest,
    focusActiveNoteLine,
    noteFocusRequest,
    openNoteLine,
    openRepositoryIssue,
    openSyntaxField,
    repositoryIssueFocusRequest,
    syntaxFocusRequest,
  };
}

export type WorkspaceNavigation = ReturnType<typeof useWorkspaceNavigation>;
