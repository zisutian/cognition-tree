import { createSyntaxProfileDraft } from "../../ctn/syntax/profileDraft";
import { defaultCtnSyntaxProfile } from "../../ctn/syntax/defaultSyntaxProfile";
import {
  defaultJournalCtnSyntaxProfileV2,
  defaultJournalSyntaxSourceV2,
} from "../../journal/syntax/journalSyntax";
import type { JournalViewModel } from "../../src/application/journal";
import type { TodoViewModel } from "../../src/application/todo";
import {
  defaultTodoCtnSyntaxProfileV2,
  defaultTodoSyntaxSourceV2,
} from "../../todo/syntax/todoSyntax";
import { createUiSyntaxView } from "../../src/application/workspace/projection/viewSyntax";
import type { NotesViewModel } from "../../src/application/workspace/activities/notes/notesViewModel";
import type { RepositoryViewModel } from "../../src/application/workspace/activities/repository/repositoryViewModel";
import type { StructureOperationActivityViewModel } from "../../src/application/workspace/activities/structure-operation/structureOperationViewModel";
import type { SyntaxViewModel } from "../../src/application/workspace/activities/syntax/syntaxViewModel";
import type { VisualizationViewModel } from "../../src/application/workspace/activities/visualization/visualizationViewModel";
import type { WorkspaceShell } from "../../src/application/workspace/runtime/useWorkspaceApplication";

export type TestActivityViews = {
  journal: JournalViewModel;
  notes: NotesViewModel;
  repository: RepositoryViewModel;
  shell: WorkspaceShell;
  structureOperation: StructureOperationActivityViewModel;
  syntax: SyntaxViewModel;
  todo: TodoViewModel;
  visualization: VisualizationViewModel;
};

export function createView(
  overrides: Partial<TestActivityViews> = {},
): TestActivityViews {
  const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
  const syntax = createUiSyntaxView({
    draft,
  });

  return {
    journal: {
      activeEntry: {
        createdAt: "2026-01-02T03:04:05.000Z",
        id: "journal-entry-00000000-0000-4000-8000-000000000001",
        title: "2026-01-02-0001",
        updatedAt: "2026-01-02T03:05:00.000Z",
      },
      createEntry: () =>
        "journal-entry-00000000-0000-4000-8000-000000000002",
      deleteEntry: () => undefined,
      diagnostics: {
        diagnostics: [],
        errorCount: 0,
        status: "ready",
        warningCount: 0,
      },
      editor: {
        contentMode: { kind: "body", title: "2026-01-02-0001" },
        documentText: "",
        errorMessage: "",
        focusTarget: null,
        onActiveLineChange: () => undefined,
        onConsumeFocusTarget: () => undefined,
        stats: { lineCount: 1, rootCount: 0, totalBlocks: 0 },
        syntaxProfile: defaultJournalCtnSyntaxProfileV2,
        updateBody: () => undefined,
      },
      groups: [{
        entries: [{
          createdAt: "2026-01-02T03:04:05.000Z",
          id: "journal-entry-00000000-0000-4000-8000-000000000001",
          isActive: true,
          title: "2026-01-02-0001",
          updatedAt: "2026-01-02T03:05:00.000Z",
        }],
        key: "2026-01",
        label: "2026 年 1 月",
      }],
      navigation: {
        focusRequest: null,
        openEntryLine: () => undefined,
      },
      outline: {
        activeBlock: null,
        nodes: [],
        onSelectLine: () => undefined,
      },
      persistence: { status: "saved" },
      referenceNavigation: {
        navigate: () => undefined,
        resolve: () => [],
      },
      selectEntry: () => undefined,
      syntax: {
        profile: defaultJournalCtnSyntaxProfileV2,
        source: defaultJournalSyntaxSourceV2,
        updateSource: () => undefined,
      },
    },
    notes: {
      activeNote: {
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "note-source",
        title: "当前笔记",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
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
        documentText: "当前笔记",
        errorMessage: "",
        focusTarget: null,
        mode: "ctn",
        stats: {
          lineCount: 1,
          rootCount: 1,
          totalBlocks: 1,
        },
        syntaxProfile: defaultCtnSyntaxProfile,
        onActiveLineChange: () => undefined,
        onConsumeFocusTarget: () => undefined,
      },
      outline: {
        activeBlock: null,
        nodes: [],
        onSelectLine: () => undefined,
      },
      referenceNavigation: {
        navigate: () => undefined,
        resolve: () => [],
      },
      updateSource: (change) => ({
        authoritativeSource: change.source,
        titleNormalized: false,
      }),
    },
    repository: {
      activeRepositoryId: "primary",
      activeRepositoryLabel: "Primary",
      catalogErrorMessage: "",
      catalogStatus: "ready",
      creatableAdapters: [
        { label: "本地", value: "local" },
        { label: "WebDAV", value: "webdav" },
      ],
      createRepository: async () => undefined,
      deleteRepository: async () => undefined,
      deletionBlocked: false,
      deletionWarning: "",
      discardPendingChangesAndReload: async () => undefined,
      hasSaveConflict: false,
      issues: [],
      refreshRepositories: async () => undefined,
      reload: async () => undefined,
      repositories: [
        {
          adapter: "local",
          adapterLabel: "本地",
          displayLabel: "Primary · 本地",
          id: "primary",
          label: "Primary",
          location: {
            hostPath: null,
            serverPath: "/data/repositories/primary",
            type: "local",
          },
          locationRows: [{
            copyValue: "/data/repositories/primary",
            label: "服务端路径",
            value: "/data/repositories/primary",
          }],
          labelIssue: null,
        },
      ],
      operation: "idle",
      persistenceStatusLabel: "已保存",
      reloadSystemCatalog: async () => undefined,
      renameRepository: async () => undefined,
      storageLabel: "本地",
      systemCatalogErrorMessage: "",
      systemCatalogStatus: "ready",
      systemIssues: [],
      systemRepositories: [],
      retrySystemRepository: async () => undefined,
      retryingSystemPurpose: null,
      selectRepository: async () => undefined,
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
      activeFileId: "syntax-default",
      activateFile: async () => undefined,
      actions: {
        addInlineRule: () => undefined,
        addMarkerRule: () => undefined,
        removeInlineRule: () => undefined,
        removeMarkerRule: () => undefined,
        updateInlineRule: () => undefined,
        updateMarkerRule: () => undefined,
        updateName: () => undefined,
        updateTabDisplayWidth: () => undefined,
        updateTitleRule: () => undefined,
        updateTopLevelUnmarkedRule: () => undefined,
      },
      createFile: async () => "syntax-copy",
      deleteFile: async () => undefined,
      files: [{
        hasErrors: false,
        id: "syntax-default",
        isActive: true,
        isSelected: true,
        name: defaultCtnSyntaxProfile.name,
      }],
      hasDraftErrors: false,
      isConfigured: true,
      isSelectedAvailable: true,
      nameEditable: true,
      nameConflictMessage: "",
      onConsumeFocusTarget: () => undefined,
      policy: { scope: "workspace" },
      profileDiagnostics: [],
      protectedInlineRuleIds: [],
      protectedInlineTriggerRuleIds: [],
      protectedMarkerRuleIds: [],
      revertInvalidChanges: () => undefined,
      rootRuleLabel: "顶格概念",
      selectedTarget: {
        fileId: "syntax-default",
        kind: "workspace-file",
      },
      selectTarget: async () => undefined,
      systemConfigurations: [
        {
          available: true,
          hasErrors: false,
          isSelected: false,
          label: "日记",
          owner: "journal",
        },
        {
          available: true,
          hasErrors: false,
          isSelected: false,
          label: "代办",
          owner: "todo",
        },
      ],
      workspaceAvailable: true,
    },
    todo: {
      activeCollection: {
        createdAt: "2026-07-18T01:00:00.000Z",
        id: "todo-collection-00000000-0000-4000-8000-000000000001",
        name: "今天",
        updatedAt: "2026-07-18T04:00:00.000Z",
      },
      collections: [
        {
          completedItemCount: 1,
          createdAt: "2026-07-18T01:00:00.000Z",
          id: "todo-collection-00000000-0000-4000-8000-000000000001",
          isActive: true,
          itemCount: 2,
          name: "今天",
          updatedAt: "2026-07-18T04:00:00.000Z",
        },
        {
          completedItemCount: 0,
          createdAt: "2026-07-18T05:00:00.000Z",
          id: "todo-collection-00000000-0000-4000-8000-000000000002",
          isActive: false,
          itemCount: 0,
          name: "稍后",
          updatedAt: "2026-07-18T05:00:00.000Z",
        },
      ],
      createCollection: () =>
        "todo-collection-00000000-0000-4000-8000-000000000002",
      deleteCollection: () =>
        "todo-collection-00000000-0000-4000-8000-000000000002",
      diagnostics: {
        diagnostics: [],
        errorCount: 0,
        status: "ready",
        warningCount: 0,
      },
      editor: {
        checkableBlocks: [
          {
            blockId: "00000000-0000-4000-8000-000000000001",
            checked: true,
            label: "已完成但保持原位",
            lineNumber: 1,
          },
          {
            blockId: "00000000-0000-4000-8000-000000000002",
            checked: false,
            label: "未完成",
            lineNumber: 2,
          },
        ],
        contentMode: { kind: "body", title: "今天" },
        documentText: "[] 已完成但保持原位\n\t[] 未完成",
        focusTarget: null,
        onActiveLineChange: () => undefined,
        onConsumeFocusTarget: () => undefined,
        syntaxProfile: defaultTodoCtnSyntaxProfileV2,
        updateBody: () => undefined,
      },
      moveBlock: () => undefined,
      moveCollection: () => undefined,
      navigation: {
        focusRequest: null,
        openCollectionLine: () => undefined,
      },
      outline: {
        activeBlock: null,
        nodes: [
          {
            children: [],
            completed: true,
            completedAt: "2026-07-18T04:00:00.000Z",
            endLineNumber: 1,
            hasDiagnostics: false,
            id: "00000000-0000-4000-8000-000000000001",
            label: "代办",
            level: 0,
            lineNumber: 1,
            metadata: {
              createdAt: "2026-07-18T02:00:00.000Z",
              updatedAt: "2026-07-18T04:00:00.000Z",
            },
            text: "已完成但保持原位",
          },
          {
            children: [],
            completed: false,
            completedAt: null,
            endLineNumber: 2,
            hasDiagnostics: false,
            id: "00000000-0000-4000-8000-000000000002",
            label: "代办",
            level: 0,
            lineNumber: 2,
            metadata: {
              createdAt: "2026-07-18T03:00:00.000Z",
              updatedAt: "2026-07-18T03:00:00.000Z",
            },
            text: "未完成",
          },
        ],
        onSelectLine: () => undefined,
      },
      persistence: { status: "saved" },
      persistenceErrorMessage: "",
      renameCollection: () => undefined,
      selectCollection: () => undefined,
      syntax: {
        profile: defaultTodoCtnSyntaxProfileV2,
        source: defaultTodoSyntaxSourceV2,
        updateSource: () => undefined,
      },
      toggleBlock: () => undefined,
      updateCollectionBody: () => undefined,
      updateSyntaxSource: () => undefined,
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
        adjacencyByNoteId: new Map(),
        detailsByNoteId: new Map(),
        edges: [],
        mostReferencedNodes: [],
        nodes: [],
        revision: 0,
        stats: {
          edgeCount: 0,
          isolatedCount: 0,
          nodeCount: 0,
        },
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
