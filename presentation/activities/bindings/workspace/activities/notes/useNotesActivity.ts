import { useCallback, useMemo, useState } from "react";
import {
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceTree,
  listWorkspaceNotes,
} from "../../../../../../core/workspace/queries/workspaceQueries";
import {
  createUiOutlineNodes,
  findUiOutlineNodeAtLine,
} from "../../../../../../application/workspace/projection/viewBlocks";
import { createUiEditorView } from "../../../../../../application/workspace/projection/viewEditor";
import { createUiNoteTree } from "../../../../../../application/workspace/projection/viewTree";
import type { WorkspaceRuntime } from "../../runtime/useWorkspaceApplication";
import type { WorkspaceSelection } from "../../selection/useWorkspaceSelection";
import type { WorkspaceNavigation } from "../../navigation/useWorkspaceNavigation";
import type { NotesViewModel } from "../../../../../../application/workspace/activities/notes/notesViewModel";
import {
  resolveWorkspaceReferenceNavigation,
} from "../../../../../../core/workspace/queries/workspaceReferenceNavigation";
import {
  createCtnEditableSourceFromDocument,
  getCtnEditableLineNumber,
  type CtnEditableSource,
} from "../../../../../../core/ctn/metadata/editableSource";

export function useNotesActivity({
  navigation,
  runtime,
  selection,
}: {
  navigation: WorkspaceNavigation;
  runtime: WorkspaceRuntime;
  selection: WorkspaceSelection;
}): NotesViewModel {
  const [activeEditorPosition, setActiveEditorPosition] = useState<{
    lineNumber: number;
    noteId: string;
  } | null>(null);
  const {
    analysis,
    commands,
    defaultSyntaxProfile,
    effectiveWorkspace,
    workspace,
  } = runtime;
  const index = analysis.index;
  const activeNote = selection.activeNoteId
    ? findWorkspaceNote(workspace, selection.activeNoteId)
    : null;
  const activeNoteId = activeNote?.id ?? null;
  const effectiveActiveNote = effectiveWorkspace && selection.activeNoteId
    ? findWorkspaceNote(effectiveWorkspace, selection.activeNoteId)
    : null;
  const parsedNote = useMemo(
    () => {
      const noteId = effectiveActiveNote?.id;

      if (!index || !noteId) {
        return null;
      }

      return analysis.parsedNotesById.get(noteId) ??
        getParsedWorkspaceNote(index, noteId);
    },
    [analysis.parsedNotesById, effectiveActiveNote, index],
  );
  const editableSource = useMemo(
    () => parsedNote
      ? createCtnEditableSourceFromDocument(
          parsedNote.source,
          parsedNote.document,
        )
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
      const targetNote = analysis.parsedNotesById.get(noteId) ??
        getParsedWorkspaceNote(index, noteId);

      if (!targetNote) {
        return lineNumber;
      }

      targetEditableSource = createCtnEditableSourceFromDocument(
        targetNote.source,
        targetNote.document,
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
  const focusTarget =
    navigation.noteFocusRequest?.noteId === selection.activeNoteId
      ? navigation.noteFocusRequest
      : null;
  const editor = useMemo(
    () => createUiEditorView({
      document: parsedNote?.document ?? null,
      documentText: editableSource?.source ?? activeNote?.source ?? "",
      focusTarget,
      syntaxProfile: parsedNote?.profile ?? defaultSyntaxProfile,
    }),
    [
      activeNote,
      defaultSyntaxProfile,
      editableSource,
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
  const updateActiveEditorLine = useCallback((lineNumber: number) => {
    if (!activeNoteId) {
      setActiveEditorPosition(null);
      return;
    }

    const normalizedLineNumber = Math.max(1, Math.floor(lineNumber));

    setActiveEditorPosition((current) =>
      current?.noteId === activeNoteId &&
        current.lineNumber === normalizedLineNumber
        ? current
        : {
            lineNumber: normalizedLineNumber,
            noteId: activeNoteId,
          }
    );
  }, [activeNoteId]);
  const activeBlock = useMemo(() => {
    if (
      !activeEditorPosition ||
      activeEditorPosition.noteId !== activeNoteId
    ) {
      return null;
    }

    return findUiOutlineNodeAtLine(
      outlineNodes,
      activeEditorPosition.lineNumber,
    );
  }, [activeEditorPosition, activeNoteId, outlineNodes]);

  return {
    activeNote: activeNote
      ? {
          createdAt: activeNote.createdAt,
          id: activeNote.id,
          title: activeNote.title,
          updatedAt: activeNote.updatedAt,
        }
      : null,
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
    editor: {
      ...editor,
      onActiveLineChange: updateActiveEditorLine,
      onConsumeFocusTarget: navigation.consumeNoteFocusRequest,
    },
    outline: {
      activeBlock,
      nodes: outlineNodes,
      onSelectLine(lineNumber) {
        updateActiveEditorLine(lineNumber);
        navigation.focusActiveNoteLine(lineNumber);
      },
    },
    referenceNavigation: {
      navigate(destination) {
        if (!findWorkspaceNote(workspace, destination.noteId)) {
          return;
        }

        navigation.openNoteLine(
          destination.noteId,
          projectNoteLineNumber(destination.noteId, destination.lineNumber),
        );
      },
      resolve(target) {
        return index && selection.activeNoteId
          ? resolveWorkspaceReferenceNavigation({
              activeNoteId: selection.activeNoteId,
              index,
              target,
            })
          : [];
      },
    },
    updateSource(change) {
      if (!selection.activeNoteId) {
        throw new Error("当前没有活动笔记。");
      }

      return commands.updateNoteSource(selection.activeNoteId, change);
    },
  };
}
