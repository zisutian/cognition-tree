import { useEffect, useMemo, useState } from "react";
import {
  createNextInlineRuleDraft,
  createNextMarkerRuleDraft,
  isProtectedInlineRuleDraft,
  type SyntaxProfileDraft,
  type SyntaxProfileDraftConceptRule,
  type SyntaxProfileDraftInlineRule,
  type SyntaxProfileDraftMarkerRule,
} from "../../ctn/syntax/profileDraft";
import type { FolderId } from "../../workspace/model/workspaceData";
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
} from "../../workspace/queries/workspaceQueries";
import type { WorkspaceBlockMigrationRequest } from "../../workspace/commands/blockMigrationCommands";
import {
  createUiBlockNodes,
  createUiEditorView,
  createUiNoteSummaries,
  createUiNoteTree,
  createUiOutlineNodes,
  createUiReferenceGraphView,
  createUiSidebarView,
  createUiSyntaxView,
  parseUiBlockMigrationTargetPosition,
} from "./viewData";
import type {
  UiFolderId,
  UiNoteId,
  UiSyntaxProfileDraftConceptRule,
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxProfileDraftMarkerRule,
} from "./viewTypes";
import {
  type SaveStatus,
  type Session,
} from "./useSession";
import { useIndex } from "./useIndex";
import { useSyntaxDraft } from "./useSyntaxDraft";
import { resolveFolderSelection } from "./selection";
import {
  getMoveBlockFailureMessage,
  getMoveBlockSuccessMessage,
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
  resolveDifferentNoteId,
} from "./viewState";

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

const saveStatusLabels: Record<SaveStatus, string> = {
  error: "保存失败",
  idle: "等待保存",
  saved: "已保存",
  saving: "保存中",
};

export function useViewModel(session: Session) {
  const {
    canChangeRepositoryPath,
    changeRepositoryPath,
    isLoaded,
    reload,
    repositoryPath,
    storageLabel,
    defaultSyntaxFile,
    syntaxFile,
    useDefaultSyntaxFile,
    updateSyntaxFile,
    workspaceData,
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
  const notes = listWorkspaceNotes(workspaceData);
  const activeNote = activeNoteId
    ? findWorkspaceNote(workspaceData, activeNoteId)
    : null;
  const activeNoteFolderId = activeNote
    ? findWorkspaceFolderIdContainingNote(workspaceData, activeNote.id)
    : null;

  useEffect(() => {
    setActiveNoteId((currentNoteId) =>
      resolveActiveNoteId(notes, currentNoteId),
    );
  }, [notes]);

  useEffect(() => {
    setSelectedFolderId((currentFolderId) =>
      resolveFolderSelection(workspaceData, currentFolderId),
    );
  }, [workspaceData]);

  const selectNote = (noteId: UiNoteId) => {
    if (!findWorkspaceNote(workspaceData, noteId)) {
      return;
    }

    const folderId = findWorkspaceFolderIdContainingNote(workspaceData, noteId);

    if (folderId) {
      setSelectedFolderId(folderId);
    }

    setActiveNoteId(noteId);
  };

  const selectFolder = (folderId: UiFolderId) => {
    setSelectedFolderId(
      resolveFolderSelection(workspaceData, folderId),
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
      collectWorkspaceNoteIdsInFolder(workspaceData, folderId),
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
    syntaxProfile: syntaxFile?.profile ?? defaultSyntaxFile.profile,
    updateSyntaxFile,
    workspace: context,
  });
  const effectiveActiveNote = effectiveContext && activeNoteId
    ? findWorkspaceNote(effectiveContext, activeNoteId)
    : null;
  const effectiveNotes = useMemo(
    () => (effectiveContext ? listWorkspaceNotes(effectiveContext) : []),
    [effectiveContext],
  );
  const index = useIndex(effectiveContext);
  const parsedNote = useMemo(
    () =>
      index
        ? getParsedWorkspaceNote(index, effectiveActiveNote?.id ?? null)
        : null,
    [effectiveActiveNote, index],
  );
  const activeSyntaxProfile =
    parsedNote?.profile ?? defaultSyntaxFile.profile;
  const parsedDocument = parsedNote?.document ?? null;
  const documentText = parsedNote?.source ?? "";

  useEffect(() => {
    if (
      migrationSourceNoteId &&
      findWorkspaceNote({ notes: effectiveNotes }, migrationSourceNoteId)
    ) {
      return;
    }

    if (
      effectiveActiveNote &&
      findWorkspaceNote({ notes: effectiveNotes }, effectiveActiveNote.id)
    ) {
      setMigrationSourceNoteId(effectiveActiveNote.id);
      return;
    }

    setMigrationSourceNoteId(effectiveNotes[0]?.id ?? "");
  }, [effectiveActiveNote, effectiveNotes, migrationSourceNoteId]);

  useEffect(() => {
    if (
      migrationTargetNoteId &&
      migrationTargetNoteId !== migrationSourceNoteId &&
      findWorkspaceNote({ notes: effectiveNotes }, migrationTargetNoteId)
    ) {
      return;
    }

    setMigrationTargetNoteId(
      resolveDifferentNoteId(effectiveNotes, migrationSourceNoteId),
    );
  }, [effectiveNotes, migrationSourceNoteId, migrationTargetNoteId]);

  const sourceMigrationNote = effectiveContext
    ? findWorkspaceNote(effectiveContext, migrationSourceNoteId)
    : null;
  const targetMigrationNote = effectiveContext
    ? findWorkspaceNote(effectiveContext, migrationTargetNoteId)
    : null;
  const sourceMigrationParsed = useMemo(
    () =>
      index && sourceMigrationNote
        ? getParsedWorkspaceNote(index, sourceMigrationNote.id)
        : null,
    [sourceMigrationNote, index],
  );
  const targetMigrationParsed = useMemo(
    () =>
      index && targetMigrationNote
        ? getParsedWorkspaceNote(index, targetMigrationNote.id)
        : null,
    [targetMigrationNote, index],
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
        effectiveContext,
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
    void useDefaultSyntaxFile();
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
  const sidebarNoteTree = createUiNoteTree({
    notes: notes,
    tree: getWorkspaceTree(workspaceData),
  });
  const migrationNoteTree = effectiveContext
    ? createUiNoteTree({
        includeOrphans: true,
        notes: effectiveNotes,
        tree: getWorkspaceTree(effectiveContext),
      })
    : [];
  const noteReferenceGraph = index
    ? createUiReferenceGraphView(getWorkspaceNoteReferenceGraph(index))
    : createUiReferenceGraphView({
        edges: [],
        nodes: [],
        unresolvedReferences: [],
      });
  const syntax = createUiSyntaxView({
    draft: syntaxDraft,
    draftResult: syntaxDraftResult,
    feedback: syntaxFeedback,
  });

  return {
    canChangeRepositoryPath,
    changeRepositoryPath,
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    editor: createUiEditorView({
      activeNoteTitle: activeNote?.title ?? null,
      document: parsedDocument,
      documentText,
      focusTarget: editorFocusRequest,
      hasActiveNote: Boolean(activeNote),
      syntaxProfile: activeSyntaxProfile,
      errorMessage,
    }),
    focusEditorLine,
    hasConfiguredSyntax: Boolean(syntaxFile && effectiveContext && index),
    migration: {
      noteTree: migrationNoteTree,
      notes: createUiNoteSummaries(effectiveNotes),
      onMoveBlockToPosition: moveMigrationBlock,
      onSourceNoteChange: setMigrationSourceNoteId,
      onTargetNoteChange: setMigrationTargetNoteId,
      sourceBlocks: createUiBlockNodes(
        sourceMigrationParsed?.document.blocks ?? [],
      ),
      sourceNote: sourceMigrationNote
        ? { id: sourceMigrationNote.id, title: sourceMigrationNote.title }
        : null,
      sourceNoteId: migrationSourceNoteId,
      sourceRoots: createUiBlockNodes(sourceMigrationParsed?.document.roots ?? []),
      targetNote: targetMigrationNote
        ? { id: targetMigrationNote.id, title: targetMigrationNote.title }
        : null,
      targetNoteId: migrationTargetNoteId,
      targetRoots: createUiBlockNodes(targetMigrationParsed?.document.roots ?? []),
    },
    moveNote,
    outline: {
      nodes: createUiOutlineNodes(parsedDocument?.roots ?? []),
      onSelectLine: focusEditorLine,
    },
    reload,
    renameFolder,
    selectFolder,
    selectNote,
    sidebar: createUiSidebarView({
      activeFolderId: selectedFolderId,
      activeNoteFolderId,
      activeNoteId: activeNote?.id ?? null,
      folderCount: countWorkspaceFolders(workspaceData),
      noteTree: sidebarNoteTree,
      repositoryPath,
      saveStatusLabel: saveStatusLabels[saveStatus],
      storageLabel,
    }),
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
