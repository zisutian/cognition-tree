import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
} from "../../src/ctn/syntax/profileDraft";
import { defaultCtnSyntaxProfile } from "../../src/ctn/syntax/defaultSyntaxProfile";
import { createUiSyntaxView } from "../../src/application/workspace/projection/viewSyntax";
import type { ViewModel } from "../../src/application/workspace/view-model/activityViewModels";

export function createView(overrides: Partial<ViewModel> = {}): ViewModel {
  const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
  const syntax = createUiSyntaxView({
    draft,
    draftResult: buildSyntaxProfileDraft(draft),
    feedback: null,
  });

  return {
    notes: {
      directory: {
        activeFolderId: null,
        activeNode: { kind: "note", noteId: "note-source" },
        createFolder: () => undefined,
        createNote: () => undefined,
        deleteFolder: () => undefined,
        deleteNote: () => undefined,
        moveTreeNode: () => undefined,
        noteTree: [],
        renameFolder: () => undefined,
        renameNote: () => undefined,
        selectFolder: () => undefined,
        selectNote: () => undefined,
      },
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
      outline: {
        nodes: [],
        onSelectLine: () => undefined,
      },
      updateSource: () => undefined,
    },
    settings: {
      canChangeRepositoryPath: true,
      changeRepositoryPath: async () => undefined,
      reload: async () => undefined,
      repositoryPath: "/workspace",
      saveStatusLabel: "已保存",
      storageLabel: "本地",
    },
    shell: {
      errorMessage: "",
      hasConfiguredSyntax: true,
      useDefaultSyntax: () => undefined,
    },
    structureOperation: {
      deleteFolder: () => undefined,
      deleteNote: () => undefined,
      indentUnitCount: defaultCtnSyntaxProfile.tabDisplayWidth,
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
      renameFolder: () => undefined,
      renameNote: () => undefined,
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
