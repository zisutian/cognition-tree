import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
} from "../../src/ctn/syntax/profileDraft";
import { defaultCtnSyntaxProfile } from "../../src/ctn/syntax/defaultSyntaxProfile";
import { createUiSyntaxView } from "../../src/application/workspace/projection/viewSyntax";
import type { NotesViewModel } from "../../src/application/workspace/activities/notes/notesViewModel";
import type { SettingsViewModel } from "../../src/application/workspace/activities/settings/settingsViewModel";
import type { StructureOperationActivityViewModel } from "../../src/application/workspace/activities/structure-operation/structureOperationViewModel";
import type { SyntaxViewModel } from "../../src/application/workspace/activities/syntax/syntaxViewModel";
import type { VisualizationViewModel } from "../../src/application/workspace/activities/visualization/visualizationViewModel";
import type { WorkspaceShell } from "../../src/application/workspace/runtime/useWorkspaceApplication";

export type TestActivityViews = {
  notes: NotesViewModel;
  settings: SettingsViewModel;
  shell: WorkspaceShell;
  structureOperation: StructureOperationActivityViewModel;
  syntax: SyntaxViewModel;
  visualization: VisualizationViewModel;
};

export function createView(
  overrides: Partial<TestActivityViews> = {},
): TestActivityViews {
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
        clearFolderSelection: () => undefined,
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
        mode: "ctn",
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
      activeRepositoryId: "primary",
      contextWidth: 280,
      createRepository: async () => undefined,
      discardPendingChangesAndReload: async () => undefined,
      hasSaveConflict: false,
      reload: async () => undefined,
      repositories: [
        {
          adapter: "local",
          id: "primary",
          label: "Primary",
          repositoryPath: "/workspace",
        },
      ],
      repositoryPath: "/workspace",
      saveStatusLabel: "已保存",
      storageLabel: "本地",
      selectRepository: async () => undefined,
      setContextWidth: () => undefined,
    },
    shell: {
      errorMessage: "",
      hasConfiguredSyntax: true,
    },
    structureOperation: {
      deleteFolder: () => undefined,
      deleteNote: () => undefined,
      indentUnitCount: defaultCtnSyntaxProfile.tabDisplayWidth,
      mode: "betweenNotes",
      moveTreeNode: () => undefined,
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
      onSelectDirectoryNote: () => undefined,
      onSetMode: () => undefined,
      onSwapSourceAndTargetNotes: () => undefined,
      pairSelectionPhase: "selectSource",
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
        updateInlineRule: () => undefined,
        updateMarkerRule: () => undefined,
        updateName: () => undefined,
        updateTabDisplayWidth: () => undefined,
        updateTitleRule: () => undefined,
      },
      createConfiguration: async () => undefined,
      isConfigured: true,
      protectedInlineRuleIds: [],
    },
    visualization: {
      activeNoteId: "note-source",
      filter: {
        hideIsolated: false,
        localDepth: 1,
        mode: "global",
        query: "",
      },
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
      setHideIsolated: () => undefined,
      setLocalDepth: () => undefined,
      setMode: () => undefined,
      setQuery: () => undefined,
    },
    ...overrides,
  };
}
