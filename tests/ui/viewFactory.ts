import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
} from "../../src/ctn/syntax/profileDraft";
import { defaultCtnSyntaxProfile } from "../../src/ctn/syntax/defaultSyntaxProfile";
import { createUiSyntaxView } from "../../src/application/workspace/projection/viewSyntax";
import type { ViewModel } from "../../src/application/workspace/view-model/useViewModel";

export function createView(overrides: Partial<ViewModel> = {}): ViewModel {
  const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
  const syntax = createUiSyntaxView({
    draft,
    draftResult: buildSyntaxProfileDraft(draft),
    feedback: null,
  });

  return {
    canChangeRepositoryPath: true,
    changeRepositoryPath: async () => undefined,
    createFolder: () => undefined,
    createNote: () => undefined,
    deleteFolder: () => undefined,
    deleteNote: () => undefined,
    editor: {
      currentNoteTitle: "当前笔记",
      diagnostics: [],
      documentText: "当前笔记",
      errorMessage: "",
      focusTarget: null,
      hasActiveNote: true,
      hasParsedDocument: true,
      stats: {
        diagnosticCount: 0,
        lineCount: 1,
        rootCount: 1,
        totalBlocks: 1,
      },
      syntaxProfile: defaultCtnSyntaxProfile,
    },
    errorMessage: "",
    focusEditorLine: () => undefined,
    hasConfiguredSyntax: true,
    structureOperation: {
      mode: "betweenNotes",
      noteTree: [
        {
          canDrag: true,
          folderId: null,
          id: "source-node",
          kind: "note",
          noteId: "note-source",
          parentFolderId: null,
          title: "Source note",
        },
        {
          canDrag: true,
          folderId: null,
          id: "target-node",
          kind: "note",
          noteId: "note-target",
          parentFolderId: null,
          title: "Target note",
        },
      ],
      onMoveStructureBlockBetweenNotes: () => undefined,
      onMoveStructureBlockWithinNote: () => undefined,
      onOpenNoteStructure: () => undefined,
      onPairNotesForStructureOperation: () => undefined,
      onSelectSourceNote: () => undefined,
      onSelectTargetNote: () => undefined,
      onSelectStructureNote: () => undefined,
      onSetMode: () => undefined,
      sourceBlocks: [],
      sourceNote: { id: "note-source", title: "Source note" },
      sourceNoteId: "note-source",
      sourceRoots: [],
      structureBlocks: [],
      structureNote: { id: "note-source", title: "Source note" },
      structureNoteId: "note-source",
      structureRoots: [],
      targetNote: { id: "note-target", title: "Target note" },
      targetNoteId: "note-target",
      targetRoots: [],
    },
    moveNote: () => undefined,
    moveSidebarTreeNode: () => undefined,
    outline: {
      nodes: [],
      onSelectLine: () => undefined,
    },
    reload: async () => undefined,
    renameFolder: () => undefined,
    renameNote: () => undefined,
    selectFolder: () => undefined,
    selectNote: () => undefined,
    sidebar: {
      activeFolderId: null,
      activeNoteFolderId: null,
      activeNoteId: "note-source",
      noteTree: [],
      repositoryPath: "/workspace",
      saveStatusLabel: "已保存",
      storageLabel: "本地",
    },
    syntax: {
      ...syntax,
      actions: {
        addInlineRule: () => undefined,
        addMarkerRule: () => undefined,
        removeInlineRule: () => undefined,
        removeMarkerRule: () => undefined,
        updateConceptRule: () => undefined,
        updateDraftField: () => undefined,
        updateInlineRule: () => undefined,
        updateMarkerRule: () => undefined,
        updateTitleRule: () => undefined,
      },
      protectedInlineRuleIds: [],
    },
    updateActiveNoteSource: () => undefined,
    useDefaultSyntax: () => undefined,
    visualization: {
      activeNoteId: "note-source",
      graph: {
        edges: [],
        mostReferencedNodes: [],
        nodes: [],
        stats: {
          edgeCount: 0,
          isolatedCount: 0,
          nodeCount: 0,
        },
        unresolvedReferences: [],
      },
      onSelectNote: () => undefined,
    },
    ...overrides,
  };
}
