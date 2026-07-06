import { useEffect, useMemo, useState } from "react";
import type { FolderId } from "../../../workspace/model/workspaceData";
import {
  collectWorkspaceNoteIdsInFolder,
  countWorkspaceFolders,
  findWorkspaceFolderIdContainingNote,
  findWorkspaceNote,
  getDefaultWorkspaceFolderId,
  getParsedWorkspaceNote,
  getWorkspaceNoteReferenceGraph,
  getWorkspaceTree,
  listWorkspaceNotes,
} from "../../../workspace/queries/workspaceQueries";
import {
  createUiOutlineNodes,
} from "../projection/viewBlocks";
import { createUiEditorView } from "../projection/viewEditor";
import { createUiReferenceGraphView } from "../projection/viewGraph";
import {
  createUiNoteTree,
  type UiFolderId,
  type UiNoteId,
  type UiTreeMoveRequest,
} from "../projection/viewTree";
import { createUiSyntaxView } from "../projection/viewSyntax";
import { createUiSidebarView } from "../projection/viewSidebar";
import type {
  WorkspaceSaveStatus,
  Session,
} from "../session/useSession";
import { createSyntaxDraftActions } from "./syntaxDraftActions";
import { createWorkspaceTreeNodeReference } from "./sidebarTreeMove";
import { useMigrationViewModel } from "./useMigrationViewModel";
import { useWorkspaceParseIndex } from "./useWorkspaceParseIndex";
import { useSyntaxDraft } from "./useSyntaxDraft";
import { resolveFolderSelection } from "./selection";
import {
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
} from "./viewSelection";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

export type WorkspaceViewModelScope = {
  editor: boolean;
  migration: boolean;
  outline: boolean;
  referenceGraph: boolean;
  settings: boolean;
  sidebar: boolean;
  syntax: boolean;
};

const saveStatusLabels: Record<WorkspaceSaveStatus, string> = {
  error: "保存失败",
  idle: "等待保存",
  saved: "已保存",
  saving: "保存中",
};

const emptyReferenceGraphView = createUiReferenceGraphView({
  edges: [],
  nodes: [],
  unresolvedReferences: [],
});

export function useViewModel(
  session: Session,
  scope: WorkspaceViewModelScope,
) {
  const {
    canChangeRepositoryPath,
    changeRepositoryPath,
    isLoaded,
    reload,
    repositoryPath,
    storageLabel,
    defaultWorkspaceSyntaxFile,
    workspaceSyntaxFile,
    useDefaultWorkspaceSyntaxFile,
    updateWorkspaceSyntaxSource,
    workspace,
    context,
    commands,
    errorMessage,
    saveStatus,
  } = session;
  const [selectedFolderId, setSelectedFolderId] =
    useState<FolderId>(getDefaultWorkspaceFolderId);
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<UiNoteId | null>(null);
  const notes = listWorkspaceNotes(workspace);
  const activeNote = activeNoteId
    ? findWorkspaceNote(workspace, activeNoteId)
    : null;
  const activeNoteFolderId = activeNote
    ? findWorkspaceFolderIdContainingNote(workspace, activeNote.id)
    : null;

  useEffect(() => {
    setActiveNoteId((currentNoteId) =>
      resolveActiveNoteId(notes, currentNoteId),
    );
  }, [notes]);

  useEffect(() => {
    setSelectedFolderId((currentFolderId) =>
      resolveFolderSelection(workspace, currentFolderId),
    );
  }, [workspace]);

  const selectNote = (noteId: UiNoteId) => {
    if (!findWorkspaceNote(workspace, noteId)) {
      return;
    }

    const folderId = findWorkspaceFolderIdContainingNote(workspace, noteId);

    if (folderId) {
      setSelectedFolderId(folderId);
    }

    setActiveNoteId(noteId);
  };

  const selectFolder = (folderId: UiFolderId) => {
    setSelectedFolderId(
      resolveFolderSelection(workspace, folderId),
    );
  };

  const createNote = () => {
    const noteId = commands.createNote(selectedFolderId);

    setActiveNoteId(noteId);
  };

  const createFolder = (parentFolderId: UiFolderId, title: string) => {
    const folderId = commands.createFolder(parentFolderId, title);

    setSelectedFolderId(folderId);
  };

  const renameFolder = (folderId: UiFolderId, title: string) => {
    commands.renameFolder(folderId, title);
    setSelectedFolderId(folderId);
  };

  const deleteNote = (noteId: UiNoteId) => {
    commands.deleteNote(noteId);

    setActiveNoteId((currentNoteId) =>
      resolveActiveNoteIdAfterRemovingNote(notes, currentNoteId, noteId),
    );
  };

  const deleteFolder = (folderId: UiFolderId) => {
    const removedNoteIds = new Set(
      collectWorkspaceNoteIdsInFolder(workspace, folderId),
    );

    commands.deleteFolder(folderId);
    setSelectedFolderId(getDefaultWorkspaceFolderId());

    setActiveNoteId((currentNoteId) =>
      resolveActiveNoteIdAfterRemovingNotes(notes, currentNoteId, removedNoteIds),
    );
  };

  const moveNote = (noteId: UiNoteId, targetFolderId: UiFolderId) => {
    commands.moveNote(noteId, targetFolderId);
    setSelectedFolderId(targetFolderId);
  };
  const moveSidebarTreeNode = (request: UiTreeMoveRequest) => {
    commands.moveTreeNode({
      placement: request.placement,
      source: createWorkspaceTreeNodeReference(request.source),
      target: createWorkspaceTreeNodeReference(request.target),
    });
  };

  const updateActiveNoteSource = (source: string) => {
    if (!activeNoteId) {
      return;
    }

    commands.updateNoteSource(activeNoteId, source);
  };

  const {
    effectiveContext,
    syntaxDraft,
    syntaxDraftResult,
    syntaxFeedback,
    updateSyntaxDraft,
  } = useSyntaxDraft({
    isLoaded,
    syntaxProfile:
      workspaceSyntaxFile?.profile ?? defaultWorkspaceSyntaxFile.profile,
    updateWorkspaceSyntaxSource,
    workspace: context?.workspace ?? null,
  });
  const effectiveWorkspace = effectiveContext?.workspace ?? null;
  const effectiveActiveNote = effectiveContext && activeNoteId
    ? findWorkspaceNote(effectiveContext.workspace, activeNoteId)
    : null;
  const effectiveNotes = useMemo(
    () => (effectiveWorkspace ? listWorkspaceNotes(effectiveWorkspace) : []),
    [effectiveWorkspace],
  );
  const index = useWorkspaceParseIndex(effectiveContext);
  const shouldReadActiveNote = scope.editor || scope.outline;
  const parsedNote = useMemo(
    () =>
      shouldReadActiveNote && index
        ? getParsedWorkspaceNote(index, effectiveActiveNote?.id ?? null)
        : null,
    [effectiveActiveNote, index, shouldReadActiveNote],
  );
  const activeSyntaxProfile =
    parsedNote?.profile ?? defaultWorkspaceSyntaxFile.profile;
  const parsedDocument = parsedNote?.document ?? null;
  const documentText = parsedNote?.source ?? "";

  const focusEditorLine = (lineNumber: number) => {
    setEditorFocusRequest((current) => ({
      lineNumber,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };
  const useDefaultSyntax = () => {
    void useDefaultWorkspaceSyntaxFile();
  };
  const sidebarNoteTree = useMemo(
    () =>
      scope.sidebar
        ? createUiNoteTree({
            notes,
            tree: getWorkspaceTree(workspace),
          })
        : [],
    [notes, scope.sidebar, workspace],
  );
  const sidebarFolderCount = useMemo(
    () => (scope.sidebar ? countWorkspaceFolders(workspace) : 0),
    [scope.sidebar, workspace],
  );
  const noteReferenceGraph = useMemo(
    () =>
      scope.referenceGraph && index
        ? createUiReferenceGraphView(getWorkspaceNoteReferenceGraph(index))
        : emptyReferenceGraphView,
    [index, scope.referenceGraph],
  );
  const syntax = useMemo(
    () =>
      createUiSyntaxView({
        draft: syntaxDraft,
        draftResult: syntaxDraftResult,
        feedback: syntaxFeedback,
      }),
    [syntaxDraft, syntaxDraftResult, syntaxFeedback],
  );
  const syntaxDraftActions = useMemo(
    () =>
      createSyntaxDraftActions({
        syntaxDraft,
        updateSyntaxDraft,
      }),
    [syntaxDraft, updateSyntaxDraft],
  );
  const editor = useMemo(
    () =>
      createUiEditorView({
        activeNoteTitle: activeNote?.title ?? null,
        document: parsedDocument,
        documentText,
        focusTarget: editorFocusRequest,
        hasActiveNote: Boolean(activeNote),
        syntaxProfile: activeSyntaxProfile,
        errorMessage,
      }),
    [
      activeNote,
      activeSyntaxProfile,
      documentText,
      editorFocusRequest,
      errorMessage,
      parsedDocument,
    ],
  );
  const outlineNodes = useMemo(
    () =>
      scope.outline ? createUiOutlineNodes(parsedDocument?.roots ?? []) : [],
    [parsedDocument, scope.outline],
  );
  const migration = useMigrationViewModel({
    commands,
    effectiveActiveNote,
    effectiveContext,
    effectiveNotes,
    effectiveWorkspace,
    index,
    scopeMigration: scope.migration,
    selectedFolderId,
    setActiveNoteId,
    setSelectedFolderId,
  });
  const sidebar = useMemo(
    () =>
      createUiSidebarView({
        activeFolderId: selectedFolderId,
        activeNoteFolderId,
        activeNoteId: activeNote?.id ?? null,
        folderCount: sidebarFolderCount,
        noteTree: sidebarNoteTree,
        repositoryPath,
        saveStatusLabel: saveStatusLabels[saveStatus],
        storageLabel,
      }),
    [
      activeNote,
      activeNoteFolderId,
      repositoryPath,
      saveStatus,
      selectedFolderId,
      sidebarFolderCount,
      sidebarNoteTree,
      storageLabel,
    ],
  );

  return {
    canChangeRepositoryPath,
    changeRepositoryPath,
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    editor,
    focusEditorLine,
    hasConfiguredSyntax: Boolean(
      workspaceSyntaxFile && effectiveContext && index,
    ),
    migration,
    moveNote,
    moveSidebarTreeNode,
    outline: {
      nodes: outlineNodes,
      onSelectLine: focusEditorLine,
    },
    reload,
    renameFolder,
    selectFolder,
    selectNote,
    sidebar,
    syntax: {
      ...syntax,
      ...syntaxDraftActions,
    },
    updateActiveNoteSource,
    useDefaultSyntax,
    visualization: noteReferenceGraph,
    errorMessage,
  };
}

export type ViewModel = ReturnType<typeof useViewModel>;
