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
import {
  createCtnEditableSource,
  getCtnEditableLineNumber,
  type CtnEditableSource,
} from "../../../../ctn/metadata/editableSource";

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
  const editableSource = useMemo(
    () => parsedNote
      ? createCtnEditableSource(parsedNote.source, parsedNote.profile)
      : null,
    [parsedNote],
  );
  const editableSourceByNoteId = useMemo(
    () => new Map<string, CtnEditableSource>(),
    [index],
  );
  const projectLineNumber = (lineNumber: number) =>
    editableSource
      ? getCtnEditableLineNumber(editableSource, lineNumber)
      : lineNumber;
  const projectNoteLineNumber = (noteId: string, lineNumber: number) => {
    if (!index) {
      return lineNumber;
    }

    let targetEditableSource = editableSourceByNoteId.get(noteId);

    if (!targetEditableSource) {
      const targetNote = getParsedWorkspaceNote(index, noteId);

      if (!targetNote) {
        return lineNumber;
      }

      targetEditableSource = createCtnEditableSource(
        targetNote.source,
        targetNote.profile,
      );
      editableSourceByNoteId.set(noteId, targetEditableSource);
    }

    return getCtnEditableLineNumber(targetEditableSource, lineNumber);
  };
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
      documentText: editableSource?.source ?? activeNote?.source ?? "",
      errorMessage,
      focusTarget,
      hasActiveNote: Boolean(activeNote),
      projectLineNumber,
      syntaxProfile: parsedNote?.profile ?? defaultSyntaxProfile,
    }),
    [
      activeNote,
      defaultSyntaxProfile,
      editableSource,
      errorMessage,
      focusTarget,
      parsedNote,
    ],
  );
  const outlineNodes = useMemo(
    () => createUiOutlineNodes(
      parsedNote?.document.roots ?? [],
      projectLineNumber,
    ),
    [editableSource, parsedNote],
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
        onFocusLine(
          projectNoteLineNumber(destination.noteId, destination.lineNumber),
        );
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
