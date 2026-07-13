import { useCallback, useEffect, useMemo, useState } from "react";
import type { FolderId } from "../../../workspace/model/workspaceData";
import {
  collectWorkspaceNoteIdsInFolder,
  findWorkspaceFolderIdContainingNote,
  findWorkspaceNote,
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
  type UiDirectoryActiveNode,
  type UiFolderId,
  type UiNoteId,
  type UiTreeMoveRequest,
} from "../projection/viewTree";
import { createUiSyntaxView } from "../projection/viewSyntax";
import type {
  WorkspaceSessionSaveStatus,
  Session,
} from "../session/useSession";
import { createSyntaxDraftActions } from "./syntaxDraftActions";
import { createWorkspaceTreeNodeReference } from "./sidebarTreeMove";
import { useStructureOperationViewModel } from "./useStructureOperationViewModel";
import { useVisualizationViewModel } from "./useVisualizationViewModel";
import { useWorkspaceParseIndex } from "./useWorkspaceParseIndex";
import { useSyntaxDraft } from "./useSyntaxDraft";
import { resolveFolderSelection } from "./selection";
import {
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
} from "./viewSelection";
import type { ViewModel } from "./activityViewModels";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

export type WorkspaceViewModelScope = {
  notes: boolean;
  structureOperation: boolean;
  visualization: boolean;
};

const saveStatusLabels: Record<WorkspaceSessionSaveStatus, string> = {
  error: "保存失败",
  idle: "等待保存",
  pending: "等待保存",
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
): ViewModel {
  const {
    discardPendingChangesAndReload,
    hasSaveConflict,
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
    useState<FolderId | null>(null);
  const [directoryActiveNode, setDirectoryActiveNode] =
    useState<UiDirectoryActiveNode | null>(null);
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<UiNoteId | null>(null);
  const notes = listWorkspaceNotes(workspace);
  const activeNote = activeNoteId
    ? findWorkspaceNote(workspace, activeNoteId)
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

  useEffect(() => {
    setDirectoryActiveNode((currentNode) => {
      if (currentNode?.kind === "note" && findWorkspaceNote(workspace, currentNode.noteId)) {
        return currentNode;
      }

      if (
        currentNode?.kind === "folder" &&
        resolveFolderSelection(workspace, currentNode.folderId) ===
          currentNode.folderId
      ) {
        return currentNode;
      }

      return activeNoteId
        ? { kind: "note", noteId: activeNoteId }
        : null;
    });
  }, [activeNoteId, workspace]);

  const selectNote = useCallback((noteId: UiNoteId) => {
    if (!findWorkspaceNote(workspace, noteId)) {
      return;
    }

    const folderId = findWorkspaceFolderIdContainingNote(workspace, noteId);

    setSelectedFolderId(folderId);
    setActiveNoteId(noteId);
    setDirectoryActiveNode({ kind: "note", noteId });
  }, [workspace]);

  const selectFolder = (folderId: UiFolderId) => {
    const nextFolderId = resolveFolderSelection(workspace, folderId);

    setSelectedFolderId(nextFolderId);
    setDirectoryActiveNode(
      nextFolderId ? { folderId: nextFolderId, kind: "folder" } : null,
    );
  };

  const createNote = () => {
    const noteId = commands.createNote(selectedFolderId);

    setActiveNoteId(noteId);
    setDirectoryActiveNode({ kind: "note", noteId });
  };

  const createFolder = (parentFolderId: UiFolderId | null, title: string) => {
    const folderId = commands.createFolder(parentFolderId, title);

    setSelectedFolderId(folderId);
    setDirectoryActiveNode({ folderId, kind: "folder" });
  };

  const renameFolder = (folderId: UiFolderId, title: string) => {
    commands.renameFolder(folderId, title);
    setSelectedFolderId(folderId);
    setDirectoryActiveNode({ folderId, kind: "folder" });
  };

  const renameNote = (noteId: UiNoteId, title: string) => {
    commands.renameNote(noteId, title);
    setActiveNoteId(noteId);
    setDirectoryActiveNode({ kind: "note", noteId });
  };

  const deleteNote = (noteId: UiNoteId) => {
    const nextActiveNoteId = resolveActiveNoteIdAfterRemovingNote(
      notes,
      activeNoteId,
      noteId,
    );

    commands.deleteNote(noteId);
    setActiveNoteId(nextActiveNoteId);
    setDirectoryActiveNode((currentNode) =>
      currentNode?.kind === "note" && currentNode.noteId === noteId
        ? nextActiveNoteId
          ? { kind: "note", noteId: nextActiveNoteId }
          : null
        : currentNode,
    );
  };

  const deleteFolder = (folderId: UiFolderId) => {
    const removedNoteIds = new Set(
      collectWorkspaceNoteIdsInFolder(workspace, folderId),
    );
    const nextActiveNoteId = resolveActiveNoteIdAfterRemovingNotes(
      notes,
      activeNoteId,
      removedNoteIds,
    );

    commands.deleteFolder(folderId);
    setSelectedFolderId(null);
    setActiveNoteId(nextActiveNoteId);
    setDirectoryActiveNode((currentNode) =>
      currentNode?.kind === "folder" && currentNode.folderId === folderId
        ? nextActiveNoteId
          ? { kind: "note", noteId: nextActiveNoteId }
          : null
        : currentNode?.kind === "note" && removedNoteIds.has(currentNode.noteId)
          ? nextActiveNoteId
            ? { kind: "note", noteId: nextActiveNoteId }
            : null
          : currentNode,
    );
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
    syntaxSource:
      workspaceSyntaxFile?.source ?? defaultWorkspaceSyntaxFile.source,
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
  const parsedNote = useMemo(
    () =>
      scope.notes && index
        ? getParsedWorkspaceNote(index, effectiveActiveNote?.id ?? null)
        : null,
    [effectiveActiveNote, index, scope.notes],
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
      scope.notes
        ? createUiNoteTree({
            notes,
            tree: getWorkspaceTree(workspace),
          })
        : [],
    [notes, scope.notes, workspace],
  );
  const noteReferenceGraph = useMemo(
    () =>
      scope.visualization && index
        ? createUiReferenceGraphView(getWorkspaceNoteReferenceGraph(index))
        : emptyReferenceGraphView,
    [index, scope.visualization],
  );
  const visualizationBase = useMemo(
    () => ({
      activeNoteId: activeNote?.id ?? null,
      graph: noteReferenceGraph,
      onSelectNote: selectNote,
    }),
    [activeNote, noteReferenceGraph, selectNote],
  );
  const visualization = useVisualizationViewModel(visualizationBase);
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
      scope.notes ? createUiOutlineNodes(parsedDocument?.roots ?? []) : [],
    [parsedDocument, scope.notes],
  );
  const structureOperation = useStructureOperationViewModel({
    commands,
    effectiveActiveNote,
    effectiveContext,
    effectiveNotes,
    effectiveWorkspace,
    index,
    scopeStructureOperation: scope.structureOperation,
    setActiveNoteId,
    setDirectoryActiveNode,
    setSelectedFolderId,
  });
  const hasConfiguredSyntax = Boolean(
    workspaceSyntaxFile && effectiveContext && index,
  );

  return {
    notes: {
      directory: {
        activeFolderId: selectedFolderId,
        activeNode: directoryActiveNode,
        createFolder,
        createNote,
        deleteFolder,
        deleteNote,
        moveTreeNode: moveSidebarTreeNode,
        noteTree: sidebarNoteTree,
        renameFolder,
        renameNote,
        selectFolder,
        selectNote,
      },
      editor,
      outline: {
        nodes: outlineNodes,
        onSelectLine: focusEditorLine,
      },
      updateSource: updateActiveNoteSource,
    },
    settings: {
      discardPendingChangesAndReload,
      hasSaveConflict,
      reload,
      repositoryPath,
      saveStatusLabel: hasSaveConflict
        ? "磁盘内容已更改"
        : saveStatusLabels[saveStatus],
      storageLabel,
    },
    shell: {
      errorMessage,
      hasConfiguredSyntax,
      useDefaultSyntax,
    },
    structureOperation: {
      ...structureOperation,
      deleteFolder,
      deleteNote,
      indentUnitCount:
        effectiveContext?.syntaxProfile.tabDisplayWidth ??
        defaultWorkspaceSyntaxFile.profile.tabDisplayWidth,
      renameFolder,
      renameNote,
    },
    syntax: {
      ...syntax,
      ...syntaxDraftActions,
    },
    visualization,
  };
}
