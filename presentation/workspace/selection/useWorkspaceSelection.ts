import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceStructureIndex } from "../../../core/workspace/index.ts";
import {
  collectWorkspaceNoteIdsInFolder,
  findWorkspaceNote,
  listWorkspaceNotes,
} from "../../../core/workspace/index.ts";
import {
  createWorkspaceTreeMoveDestination,
  createWorkspaceTreeNodeReference,
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
  resolveFolderSelection,
  type SessionCommands,
  type UiDirectoryActiveNode,
  type WorkspaceSelection,
} from "../../../application/workspace/index.ts";

export type { WorkspaceDirectoryMutations, WorkspaceSelection } from "../../../application/workspace/index.ts";

export function useWorkspaceSelection({ commands, workspace }: {
  commands: SessionCommands;
  workspace: WorkspaceStructureIndex;
}): WorkspaceSelection {
  const notes = useMemo(() => listWorkspaceNotes(workspace), [workspace]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const focusRequestId = useRef(0);
  const [directoryFocusRequest, setDirectoryFocusRequest] = useState<WorkspaceSelection["directoryFocusRequest"]>(null);
  const requestDirectoryFocus = useCallback((node: UiDirectoryActiveNode) => {
    setDirectoryFocusRequest({ requestId: ++focusRequestId.current, node });
  }, []);
  const consumeDirectoryFocusRequest = useCallback((requestId: number) => {
    setDirectoryFocusRequest((current) => current?.requestId === requestId ? null : current);
  }, []);
  useEffect(() => { setActiveNoteId((current) => resolveActiveNoteId(notes, current)); }, [notes]);

  const selectNote = useCallback((noteId: string) => {
    if (findWorkspaceNote(workspace, noteId)) setActiveNoteId(noteId);
  }, [workspace]);
  return {
    activeNoteId,
    directoryFocusRequest,
    consumeDirectoryFocusRequest,
    requestDirectoryFocus,
    selectFolder(folderId) {
      const existing = resolveFolderSelection(workspace, folderId);
      if (existing) requestDirectoryFocus({ kind: "folder", folderId: existing });
    },
    selectNote,
    createNote(parentFolderId) {
      const noteId = commands.createNote(parentFolderId);
      setActiveNoteId(noteId);
      requestDirectoryFocus({ kind: "note", noteId });
    },
    createFolder(parentFolderId, title) {
      const folderId = commands.createFolder(parentFolderId, title);
      requestDirectoryFocus({ kind: "folder", folderId });
    },
    renameFolder: (folderId, title) => commands.renameFolder(folderId, title),
    renameNote: (noteId, title) => commands.renameNote(noteId, title),
    deleteNote(noteId) {
      commands.deleteNote(noteId);
      setActiveNoteId((current) => resolveActiveNoteIdAfterRemovingNote(notes, current, noteId));
    },
    deleteFolder(folderId) {
      const removedIds = new Set(collectWorkspaceNoteIdsInFolder(workspace, folderId));
      commands.deleteFolder(folderId);
      setActiveNoteId((current) => resolveActiveNoteIdAfterRemovingNotes(notes, current, removedIds));
    },
    moveTreeNodes(request) {
      commands.moveTreeNodes({
        destination: createWorkspaceTreeMoveDestination(request.destination),
        sources: request.sources.map(createWorkspaceTreeNodeReference),
      });
    },
  };
}
