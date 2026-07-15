import { useMemo } from "react";
import {
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceTree,
  listWorkspaceNotes,
} from "../../../../workspace/queries/workspaceQueries";
import { createUiOutlineNodes } from "../../projection/viewBlocks";
import { createUiEditorView } from "../../projection/viewEditor";
import { createUiNoteTree } from "../../projection/viewTree";
import type { WorkspaceRuntime } from "../../runtime/useWorkspaceApplication";
import { useWorkspaceParseIndex } from "../../runtime/useWorkspaceParseIndex";
import type { WorkspaceSelection } from "../../selection/useWorkspaceSelection";
import type {
  EditorFocusRequest,
  NotesViewModel,
} from "./notesViewModel";
import {
  resolveWorkspaceReferenceNavigation,
} from "../../../../workspace/queries/workspaceReferenceNavigation";

export function useNotesActivity({
  errorMessage,
  focusTarget,
  onFocusLine,
  runtime,
  selection,
}: {
  errorMessage: string;
  focusTarget: EditorFocusRequest | null;
  onFocusLine: (lineNumber: number) => void;
  runtime: WorkspaceRuntime;
  selection: WorkspaceSelection;
}): NotesViewModel {
  const {
    commands,
    defaultSyntaxProfile,
    effectiveContext,
    effectiveWorkspace,
    parseIndexCache,
    workspace,
  } = runtime;
  const index = useWorkspaceParseIndex(parseIndexCache, effectiveContext);
  const activeNote = selection.activeNoteId
    ? findWorkspaceNote(workspace, selection.activeNoteId)
    : null;
  const effectiveActiveNote = effectiveWorkspace && selection.activeNoteId
    ? findWorkspaceNote(effectiveWorkspace, selection.activeNoteId)
    : null;
  const parsedNote = useMemo(
    () => index
      ? getParsedWorkspaceNote(index, effectiveActiveNote?.id ?? null)
      : null,
    [effectiveActiveNote, index],
  );
  const noteTree = useMemo(
    () => createUiNoteTree({
      notes: listWorkspaceNotes(workspace),
      tree: getWorkspaceTree(workspace),
    }),
    [workspace],
  );
  const editor = useMemo(
    () => createUiEditorView({
      activeNoteTitle: activeNote?.title ?? null,
      document: parsedNote?.document ?? null,
      documentText: parsedNote?.source ?? activeNote?.source ?? "",
      errorMessage,
      focusTarget,
      hasActiveNote: Boolean(activeNote),
      syntaxProfile: parsedNote?.profile ?? defaultSyntaxProfile,
    }),
    [activeNote, defaultSyntaxProfile, errorMessage, focusTarget, parsedNote],
  );
  const outlineNodes = useMemo(
    () => createUiOutlineNodes(parsedNote?.document.roots ?? []),
    [parsedNote],
  );

  return {
    directory: {
      activeFolderId: selection.activeFolderId,
      activeNode: selection.activeNode,
      clearFolderSelection: selection.clearFolderSelection,
      createFolder: selection.createFolder,
      createNote: selection.createNote,
      deleteFolder: selection.deleteFolder,
      deleteNote: selection.deleteNote,
      moveTreeNode: selection.moveTreeNode,
      noteTree,
      renameFolder: selection.renameFolder,
      renameNote: selection.renameNote,
      selectFolder: selection.selectFolder,
      selectNote: selection.selectNote,
    },
    editor,
    outline: {
      nodes: outlineNodes,
      onSelectLine: onFocusLine,
    },
    referenceNavigation: {
      navigate(destination) {
        if (!findWorkspaceNote(workspace, destination.noteId)) {
          return;
        }

        selection.selectNote(destination.noteId);
        onFocusLine(destination.lineNumber);
      },
      resolve(target) {
        return index && selection.activeNoteId
          ? resolveWorkspaceReferenceNavigation({
              activeNoteId: selection.activeNoteId,
              index,
              target,
              workspace,
            })
          : [];
      },
    },
    updateSource(source) {
      if (selection.activeNoteId) {
        commands.updateNoteSource(selection.activeNoteId, source);
      }
    },
  };
}
