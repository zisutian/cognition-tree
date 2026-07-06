import { useEffect, useMemo, useState } from "react";
import {
  createNextInlineRuleDraft,
  createNextMarkerRuleDraft,
  isProtectedInlineRuleDraft,
  type SyntaxProfileDraft,
  type SyntaxProfileDraftConceptRule,
  type SyntaxProfileDraftInlineRule,
  type SyntaxProfileDraftMarkerRule,
} from "../../../ctn/syntax/profileDraft";
import type { FolderId } from "../../../workspace/model/workspaceData";
import {
  collectWorkspaceNoteIdsInFolder,
  countWorkspaceFolders,
  findWorkspaceFolderIdContainingNote,
  findWorkspaceNote,
  hasWorkspaceNote,
  getDefaultWorkspaceFolderId,
  getParsedWorkspaceNote,
  getWorkspaceNoteReferenceGraph,
  getWorkspaceTree,
  listWorkspaceNotes,
} from "../../../workspace/queries/workspaceQueries";
import type { WorkspaceBlockMigrationRequest } from "../../../workspace/commands/blockMigrationCommands";
import {
  createUiBlockNodes,
  createUiOutlineNodes,
} from "../projection/viewBlocks";
import { createUiEditorView } from "../projection/viewEditor";
import { createUiReferenceGraphView } from "../projection/viewGraph";
import {
  createUiNoteSummaries,
  createUiNoteTree,
  type UiFolderId,
  type UiNoteId,
  type UiTreeNodeReference,
  type UiTreeMoveRequest,
} from "../projection/viewTree";
import {
  createUiSyntaxView,
  type UiSyntaxProfileDraftConceptRule,
  type UiSyntaxProfileDraftInlineRule,
  type UiSyntaxProfileDraftMarkerRule,
} from "../projection/viewSyntax";
import { createUiSidebarView } from "../projection/viewSidebar";
import type {
  WorkspaceSaveStatus,
  Session,
} from "../session/useSession";
import {
  parseUiBlockMigrationTargetPosition,
} from "../projection/viewMigration";
import { useWorkspaceParseIndex } from "./useWorkspaceParseIndex";
import { useSyntaxDraft } from "./useSyntaxDraft";
import { resolveFolderSelection } from "./selection";
import {
  getMoveBlockFailureMessage,
  getMoveBlockSuccessMessage,
} from "../projection/viewMigrationMessages";
import {
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
  resolveDifferentNoteId,
} from "./viewSelection";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

type MoveBlockActionResult =
  | {
      message: string;
      status: "moved";
    }
  | {
      message: string;
      status: "failed";
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

function createWorkspaceTreeNodeReference(reference: UiTreeNodeReference) {
  return reference.kind === "folder"
    ? {
        folderId: reference.folderId as FolderId,
        kind: "folder" as const,
      }
    : {
        kind: "note" as const,
        noteId: reference.noteId,
      };
}

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
  const [migrationSourceNoteId, setMigrationSourceNoteId] = useState("");
  const [migrationTargetNoteId, setMigrationTargetNoteId] = useState("");
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
      scope.migration && index && sourceMigrationNote
        ? getParsedWorkspaceNote(index, sourceMigrationNote.id)
        : null,
    [sourceMigrationNote, index, scope.migration],
  );
  const targetMigrationParsed = useMemo(
    () =>
      scope.migration && index && targetMigrationNote
        ? getParsedWorkspaceNote(index, targetMigrationNote.id)
        : null,
    [targetMigrationNote, index, scope.migration],
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
      ) ?? selectedFolderId,
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
  const focusEditorLine = (lineNumber: number) => {
    setEditorFocusRequest((current) => ({
      lineNumber,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };
  const useDefaultSyntax = () => {
    void useDefaultWorkspaceSyntaxFile();
  };
  const updateSyntaxDraftField = (
    field: keyof Pick<SyntaxProfileDraft, "name" | "tabDisplayWidth">,
    value: string,
  ) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      [field]: value,
    });
  };
  const updateSyntaxMarkerRule = (
    ruleId: string,
    patch: Partial<UiSyntaxProfileDraftMarkerRule>,
  ) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      markerRules: syntaxDraft.markerRules.map((rule) =>
        rule.id === ruleId
          ? { ...rule, ...(patch as Partial<SyntaxProfileDraftMarkerRule>) }
          : rule,
      ),
    });
  };
  const updateSyntaxConceptRule = (
    patch: Partial<UiSyntaxProfileDraftConceptRule>,
  ) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      conceptRule: {
        ...syntaxDraft.conceptRule,
        ...(patch as Partial<SyntaxProfileDraftConceptRule>),
      },
    });
  };
  const updateSyntaxInlineRule = (
    ruleId: string,
    patch: Partial<UiSyntaxProfileDraftInlineRule>,
  ) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      inlineRules: syntaxDraft.inlineRules.map((rule) =>
        rule.id === ruleId
          ? { ...rule, ...(patch as Partial<SyntaxProfileDraftInlineRule>) }
          : rule,
      ),
    });
  };
  const addSyntaxMarkerRule = () => {
    updateSyntaxDraft({
      ...syntaxDraft,
      markerRules: [
        ...syntaxDraft.markerRules,
        createNextMarkerRuleDraft(syntaxDraft.markerRules),
      ],
    });
  };
  const removeSyntaxMarkerRule = (ruleId: string) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      markerRules: syntaxDraft.markerRules.filter((rule) => rule.id !== ruleId),
    });
  };
  const addSyntaxInlineRule = (kind: "paired" | "single") => {
    updateSyntaxDraft({
      ...syntaxDraft,
      inlineRules: [
        ...syntaxDraft.inlineRules,
        createNextInlineRuleDraft(syntaxDraft.inlineRules, kind),
      ],
    });
  };
  const removeSyntaxInlineRule = (ruleId: string) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      inlineRules: syntaxDraft.inlineRules.filter((rule) => rule.id !== ruleId),
    });
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
  const migrationNoteTree = useMemo(
    () =>
      scope.migration && effectiveWorkspace
        ? createUiNoteTree({
            includeOrphans: true,
            notes: effectiveNotes,
            tree: getWorkspaceTree(effectiveWorkspace),
          })
        : [],
    [effectiveNotes, effectiveWorkspace, scope.migration],
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
  const migrationNoteSummaries = useMemo(
    () => (scope.migration ? createUiNoteSummaries(effectiveNotes) : []),
    [effectiveNotes, scope.migration],
  );
  const sourceMigrationBlocks = useMemo(
    () =>
      scope.migration
        ? createUiBlockNodes(sourceMigrationParsed?.document.blocks ?? [])
        : [],
    [scope.migration, sourceMigrationParsed],
  );
  const sourceMigrationRoots = useMemo(
    () =>
      scope.migration
        ? createUiBlockNodes(sourceMigrationParsed?.document.roots ?? [])
        : [],
    [scope.migration, sourceMigrationParsed],
  );
  const targetMigrationRoots = useMemo(
    () =>
      scope.migration
        ? createUiBlockNodes(targetMigrationParsed?.document.roots ?? [])
        : [],
    [scope.migration, targetMigrationParsed],
  );
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
    migration: {
      noteTree: migrationNoteTree,
      notes: migrationNoteSummaries,
      onMoveBlockToPosition: moveMigrationBlock,
      onSourceNoteChange: setMigrationSourceNoteId,
      onTargetNoteChange: setMigrationTargetNoteId,
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
    },
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
      actions: {
        addInlineRule: addSyntaxInlineRule,
        addMarkerRule: addSyntaxMarkerRule,
        removeInlineRule: removeSyntaxInlineRule,
        removeMarkerRule: removeSyntaxMarkerRule,
        updateConceptRule: updateSyntaxConceptRule,
        updateDraftField: updateSyntaxDraftField,
        updateInlineRule: updateSyntaxInlineRule,
        updateMarkerRule: updateSyntaxMarkerRule,
      },
      protectedInlineRuleIds: syntaxDraft.inlineRules
        .filter(isProtectedInlineRuleDraft)
        .map((rule) => rule.id),
    },
    updateActiveNoteSource,
    useDefaultSyntax,
    visualization: noteReferenceGraph,
    errorMessage,
  };
}

export type ViewModel = ReturnType<typeof useViewModel>;
