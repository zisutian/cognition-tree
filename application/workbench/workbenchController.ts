// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalWorkspaceReferenceResolver,
} from "../journal/journalExternalReferences";
import type {
  WorkspaceContentDestination,
} from "../navigation/contentDestination";
import type {
  ApiAccessAdministration,
} from "../apiAccess/apiAccessAdministration";
import type { OperationAdministration } from "../operations/operationAdministration";
import {
  createJournalSessionController,
  type JournalSessionController,
} from "../journal/journalSessionController";
import {
  createBuiltInCatalogController,
  type BuiltInCatalogState,
  type BuiltInCatalogController,
} from "../repository/builtInCatalogController";
import type {
  BuiltInCatalog,
  BuiltInDescriptor,
  BuiltInId,
} from "../repository/builtInCatalog";
import type { JournalRepositoryProvider } from "../journal/persistence/journalRepository";
import type { TodoRepositoryProvider } from "../todo/persistence/todoRepository";
import {
  createRepositoryCatalogController,
  type RepositoryCatalogControllerSnapshot,
} from "../repository/repositoryCatalogController";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RenameRepositoryRequest,
} from "../repository/repositoryCatalog";
import type { ActiveRepositorySelection } from "../repository/activeRepositorySelection";
import type { WorkspaceRepositoryCatalog } from "../repository/workspaceRepositoryCatalog";
import type { WorkspaceRepositoryContent } from "../workspace/persistence/workspaceRepository";
import type {
  WorkspaceRepositoryProvider,
  WorkspaceRepositoryProvisioner,
} from "../workspace/persistence/workspaceRepositoryProvider";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import type {
  DomainChangeEventSource,
} from "../sync/domainChangeEvents";
import {
  createSearchController,
  type SearchController,
  type SearchControllerActions,
  type SearchControllerState,
} from "../search/searchController";
import type { SearchResourceVersion } from "../search/searchTypes";
import {
  createTodoSessionController,
  type TodoSessionController,
} from "../todo/todoSessionController";
import type { SessionCommandDependencies } from "../workspace/session/sessionCommands";
import type {
  WorkspaceSessionController,
} from "../workspace/session/workspaceSessionController";
import {
  createBuiltInSessionSlot,
  type WorkbenchBuiltInSession,
} from "./builtInSessionSlot";
import {
  createJournalWorkspaceReferenceResolver,
  type JournalWorkspaceReferenceSnapshot,
} from "./journalWorkspaceReferences";
import {
  createWorkspaceNoteNavigationController,
  type WorkbenchNavigationState,
} from "./workspaceNoteNavigationController";
import {
  createWorkspaceSessionSlot,
  type WorkbenchWorkspaceSession,
} from "./workspaceSessionSlot";
import { createWorkbenchSearchQuery } from "./workbenchSearchQuery";
import {
  createCheckpointReloadReconciler,
  type CheckpointReloadReconciler,
} from "./checkpointReloadReconciler";

export type { WorkbenchNavigationState } from "./workspaceNoteNavigationController";
export type { WorkbenchWorkspaceSession } from "./workspaceSessionSlot";
export type { WorkbenchBuiltInSession } from "./builtInSessionSlot";

export type WorkbenchRepositoryCatalogSnapshot =
  RepositoryCatalogControllerSnapshot;

export type WorkbenchControllerSnapshot = {
  builtIns: {
    catalog: {
      catalogLabel: string;
      state: BuiltInCatalogState;
    };
    journal: WorkbenchBuiltInSession<JournalSessionController>;
    todo: WorkbenchBuiltInSession<TodoSessionController>;
  };
  catalog: WorkbenchRepositoryCatalogSnapshot;
  navigation: WorkbenchNavigationState;
  referenceResolutionGeneration: number;
  search: SearchControllerState;
  workspace: WorkbenchWorkspaceSession;
};

export type WorkbenchWorkspaceFacade = Pick<
  WorkspaceSessionController,
  | "activateSyntaxFile"
  | "commands"
  | "createSyntaxFile"
  | "deleteSyntaxFile"
  | "discardPendingChangesAndReload"
  | "flushPendingChanges"
  | "synchronizePendingChanges"
  | "keepLocalConflictAndSynchronize"
  | "loadConflictDetails"
  | "prepareForRepositoryRemoval"
  | "recoverLocalConflictCopy"
  | "reload"
  | "updateSyntaxFileSource"
  | "useRemoteConflictAndSynchronize"
>;

export type WorkbenchBuiltInFacade<
  Controller extends JournalSessionController | TodoSessionController,
> = Pick<
  Controller,
  | "discardPendingChangesAndReload"
  | "keepLocalConflictAndSynchronize"
  | "loadConflictDetails"
  | "mutate"
  | "recoverLocalConflictCopy"
  | "reload"
  | "requestSync"
  | "synchronizePendingChanges"
  | "useRemoteConflictAndSynchronize"
>;

export type WorkbenchSearchFacade = SearchControllerActions;

export type WorkbenchController = {
  apiAccessAdministration: ApiAccessAdministration;
  operationAdministration: OperationAdministration;
  journal: WorkbenchBuiltInFacade<JournalSessionController>;
  journalReferenceResolver: JournalWorkspaceReferenceResolver;
  search: WorkbenchSearchFacade;
  todo: WorkbenchBuiltInFacade<TodoSessionController>;
  workspace: WorkbenchWorkspaceFacade;
  consumeWorkspaceNoteDestination(requestId: number): void;
  createRepository(input: CreateRepositoryRequest): Promise<void>;
  deleteRepository(input: DeleteRepositoryRequest): Promise<void>;
  dispose(): void;
  flushLoadedContent(): Promise<void>;
  getSnapshot(): WorkbenchControllerSnapshot;
  reloadBuiltIns(): Promise<void>;
  refreshRepositories(): Promise<void>;
  renameRepository(input: RenameRepositoryRequest): Promise<void>;
  requestWorkspaceNoteDestination(
    destination: WorkspaceContentDestination,
  ): number;
  retryBuiltIn(id: BuiltInId): Promise<void>;
  retryWorkspaceNoteDestination(requestId: number): void;
  selectRepository(repositoryId: string): Promise<void>;
  start(): void;
  subscribe(listener: () => void): () => void;
};

type WorkbenchControllerOptions = {
  activeRepositorySelection: ActiveRepositorySelection;
  apiAccessAdministration: ApiAccessAdministration;
  operationAdministration: OperationAdministration;
  builtInCatalog: BuiltInCatalog;
  changeEvents?: DomainChangeEventSource;
  createInitialWorkspaceContent(label: string): WorkspaceRepositoryContent;
  createSearchVersion(value: unknown): Promise<SearchResourceVersion>;
  journalRepositories: JournalRepositoryProvider;
  scheduler: ApplicationScheduler;
  timezoneOffsetMinutes: () => number;
  todoRepositories: TodoRepositoryProvider;
  workspaceCatalog: WorkspaceRepositoryCatalog;
  workspaceCommandDependencies: SessionCommandDependencies;
  workspaceRepositories: WorkspaceRepositoryProvider &
    WorkspaceRepositoryProvisioner;
};

function findBuiltInDescriptor(
  state: ReturnType<BuiltInCatalogController["getState"]>,
  id: BuiltInId,
) {
  return state.status === "ready"
    ? state.repositories.find((descriptor) => descriptor.id === id) ?? null
    : null;
}

export function createWorkbenchController({
  activeRepositorySelection,
  apiAccessAdministration,
  builtInCatalog,
  changeEvents,
  createInitialWorkspaceContent,
  createSearchVersion,
  journalRepositories,
  operationAdministration,
  scheduler,
  timezoneOffsetMinutes,
  todoRepositories,
  workspaceCatalog,
  workspaceCommandDependencies,
  workspaceRepositories,
}: WorkbenchControllerOptions): WorkbenchController {
  const repositoryCatalogController = createRepositoryCatalogController({
    activeRepositorySelection,
    catalog: workspaceCatalog,
    provisionRepository(_input, label) {
      const content = createInitialWorkspaceContent(label);

      return workspaceRepositories.createRepository({ content, label });
    },
  });
  const builtInCatalogController = createBuiltInCatalogController(
    builtInCatalog,
  );
  const listeners = new Set<() => void>();
  let disposed = false;
  let referenceResolutionGeneration = 0;
  let started = false;
  let snapshot: WorkbenchControllerSnapshot;
  let checkpointReloadReconciler: CheckpointReloadReconciler | null = null;
  let searchController: SearchController;

  const projectBuiltInCatalog = () => ({
    catalogLabel: builtInCatalogController.catalogLabel,
    state: builtInCatalogController.getState(),
  });
  const projectRepositoryCatalog = (): WorkbenchRepositoryCatalogSnapshot =>
    repositoryCatalogController.getSnapshot();
  const publish = (referencesChanged = false) => {
    if (disposed) return;
    if (referencesChanged) referenceResolutionGeneration += 1;
    snapshot = {
      builtIns: {
        catalog: projectBuiltInCatalog(),
        journal: journalSlot.getSnapshot(),
        todo: todoSlot.getSnapshot(),
      },
      catalog: projectRepositoryCatalog(),
      navigation: navigationController.getState(),
      referenceResolutionGeneration,
      search: searchController.getState(),
      workspace: workspaceSlot.getSnapshot(),
    };
    listeners.forEach((listener) => listener());
    checkpointReloadReconciler?.notifyStateChanged();
  };
  const workspaceSlot = createWorkspaceSessionSlot({
    commandDependencies: workspaceCommandDependencies,
    onChange() {
      publish(true);
      navigationController.notifyInputsChanged();
    },
    repositories: workspaceRepositories,
    scheduler,
  });
  const journalSlot = createBuiltInSessionSlot({
    createController: (descriptor: BuiltInDescriptor | null) =>
      createJournalSessionController(
        descriptor ? journalRepositories.openJournal(descriptor) : null,
        scheduler,
        {
          createBlockId: workspaceCommandDependencies.createBlockId,
          createJournalEntryId: () =>
            `journal-entry-${workspaceCommandDependencies.createBlockId()}`,
          now: workspaceCommandDependencies.now,
          timezoneOffsetMinutes,
        },
      ),
    onChange: () => publish(),
  });
  const todoSlot = createBuiltInSessionSlot({
    createController: (descriptor: BuiltInDescriptor | null) =>
      createTodoSessionController(
        descriptor ? todoRepositories.openTodo(descriptor) : null,
        scheduler,
        {
          createBlockId: workspaceCommandDependencies.createBlockId,
          createTodoCollectionId: () =>
            `todo-collection-${workspaceCommandDependencies.createBlockId()}`,
          now: workspaceCommandDependencies.now,
        },
      ),
    onChange: () => publish(),
  });
  const navigationController = createWorkspaceNoteNavigationController({
    flushWorkspace: () => workspaceFacade.flushPendingChanges(),
    getCatalog: repositoryCatalogController.getSnapshot,
    getWorkspace: workspaceSlot.getSnapshot,
    onChange: () => publish(),
    selectRepository: repositoryCatalogController.selectRepository,
  });
  const searchQuery = createWorkbenchSearchQuery({
    builtInCatalog,
    createVersion: createSearchVersion,
    getState() {
      const workspace = workspaceSlot.getSnapshot();

      return {
        activeRepositoryId:
          repositoryCatalogController.getSnapshot().activeDescriptor?.id ??
            null,
        journal: journalSlot.getSnapshot().state,
        todo: todoSlot.getSnapshot().state,
        workspace: workspace.status === "absent" ? null : workspace,
      };
    },
    journalRepositories,
    todoRepositories,
    workspaceCatalog,
    workspaceRepositories,
  });

  searchController = createSearchController({
    onChange: () => publish(),
    query: searchQuery,
  });
  const currentWorkspaceReferenceSnapshot = ():
    JournalWorkspaceReferenceSnapshot | null => {
    const catalog = repositoryCatalogController.getSnapshot();
    const workspace = workspaceSlot.getSnapshot();

    return workspace.status === "ready" && catalog.activeDescriptor
      ? {
          repositoryId: catalog.activeDescriptor.id,
          workspace: workspace.workspace.data,
        }
      : null;
  };
  const journalReferenceResolver: JournalWorkspaceReferenceResolver = {
    resolve(references) {
      return createJournalWorkspaceReferenceResolver(
        workspaceCatalog,
        workspaceRepositories,
        {
          workspaceSnapshot: currentWorkspaceReferenceSnapshot(),
        },
      ).resolve(references);
    },
  };
  const reconcileBuiltInSessions = () => {
    const state = builtInCatalogController.getState();

    journalSlot.reconcile(findBuiltInDescriptor(state, "journal"));
    todoSlot.reconcile(findBuiltInDescriptor(state, "todo"));
  };
  const unsubscribeCatalog = repositoryCatalogController.subscribe(() => {
    workspaceSlot.reconcile(
      repositoryCatalogController.getSnapshot().activeDescriptor,
    );
    publish(true);
    navigationController.notifyInputsChanged();
  });
  const unsubscribeBuiltIns = builtInCatalogController.subscribe(() => {
    reconcileBuiltInSessions();
    publish();
  });
  const requireWorkspaceController = () => {
    const controller = workspaceSlot.getController();

    if (!controller) {
      throw new Error("Workspace session is unavailable.");
    }
    return controller;
  };
  const workspaceFacade: WorkbenchWorkspaceFacade = {
    activateSyntaxFile: (...args) =>
      requireWorkspaceController().activateSyntaxFile(...args),
    get commands() {
      return requireWorkspaceController().commands;
    },
    createSyntaxFile: (...args) =>
      requireWorkspaceController().createSyntaxFile(...args),
    deleteSyntaxFile: (...args) =>
      requireWorkspaceController().deleteSyntaxFile(...args),
    discardPendingChangesAndReload: (...args) =>
      requireWorkspaceController().discardPendingChangesAndReload(...args),
    flushPendingChanges: (...args) =>
      requireWorkspaceController().flushPendingChanges(...args),
    synchronizePendingChanges: (...args) =>
      requireWorkspaceController().synchronizePendingChanges(...args),
    keepLocalConflictAndSynchronize: (...args) =>
      requireWorkspaceController().keepLocalConflictAndSynchronize(...args),
    loadConflictDetails: (...args) =>
      requireWorkspaceController().loadConflictDetails(...args),
    prepareForRepositoryRemoval: (...args) =>
      requireWorkspaceController().prepareForRepositoryRemoval(...args),
    recoverLocalConflictCopy: (...args) =>
      requireWorkspaceController().recoverLocalConflictCopy(...args),
    reload: (...args) => requireWorkspaceController().reload(...args),
    updateSyntaxFileSource: (...args) =>
      requireWorkspaceController().updateSyntaxFileSource(...args),
    useRemoteConflictAndSynchronize: (...args) =>
      requireWorkspaceController().useRemoteConflictAndSynchronize(...args),
  };
  const journalFacade: WorkbenchBuiltInFacade<JournalSessionController> = {
    discardPendingChangesAndReload: (...args) =>
      journalSlot.getController().discardPendingChangesAndReload(...args),
    keepLocalConflictAndSynchronize: (...args) =>
      journalSlot.getController().keepLocalConflictAndSynchronize(...args),
    loadConflictDetails: (...args) =>
      journalSlot.getController().loadConflictDetails(...args),
    mutate: (...args) => journalSlot.getController().mutate(...args),
    recoverLocalConflictCopy: (...args) =>
      journalSlot.getController().recoverLocalConflictCopy(...args),
    reload: (...args) => journalSlot.getController().reload(...args),
    requestSync: (...args) =>
      journalSlot.getController().requestSync(...args),
    synchronizePendingChanges: (...args) =>
      journalSlot.getController().synchronizePendingChanges(...args),
    useRemoteConflictAndSynchronize: (...args) =>
      journalSlot.getController().useRemoteConflictAndSynchronize(...args),
  };
  const todoFacade: WorkbenchBuiltInFacade<TodoSessionController> = {
    discardPendingChangesAndReload: (...args) =>
      todoSlot.getController().discardPendingChangesAndReload(...args),
    keepLocalConflictAndSynchronize: (...args) =>
      todoSlot.getController().keepLocalConflictAndSynchronize(...args),
    loadConflictDetails: (...args) =>
      todoSlot.getController().loadConflictDetails(...args),
    mutate: (...args) => todoSlot.getController().mutate(...args),
    recoverLocalConflictCopy: (...args) =>
      todoSlot.getController().recoverLocalConflictCopy(...args),
    reload: (...args) => todoSlot.getController().reload(...args),
    requestSync: (...args) => todoSlot.getController().requestSync(...args),
    synchronizePendingChanges: (...args) =>
      todoSlot.getController().synchronizePendingChanges(...args),
    useRemoteConflictAndSynchronize: (...args) =>
      todoSlot.getController().useRemoteConflictAndSynchronize(...args),
  };
  const searchFacade: WorkbenchSearchFacade = {
    loadMore: searchController.loadMore,
    search: searchController.search,
    updateDraft: searchController.updateDraft,
    updateScrollTop: searchController.updateScrollTop,
  };

  checkpointReloadReconciler = createCheckpointReloadReconciler({
    actions: {
      reloadCatalog: () => repositoryCatalogController.reload(),
      reloadJournal: () => journalFacade.reload(),
      reloadTodo: () => todoFacade.reload(),
      reloadWorkspace: () => workspaceFacade.reload(),
    },
    getState() {
      const catalog = repositoryCatalogController.getSnapshot();
      const workspace = workspaceSlot.getSnapshot();
      const journal = journalSlot.getSnapshot();
      const todo = todoSlot.getSnapshot();

      return {
        catalog: {
          activeRepositoryId: catalog.activeDescriptor?.id ?? null,
          knownRepositoryIds: catalog.state.status === "ready"
            ? catalog.state.repositories.map(({ id }) => id)
            : null,
        },
        journalPersistenceStatus: journal.state.status === "ready"
          ? journal.state.persistence.status
          : null,
        journalRemoteRevision: journal.state.status === "ready"
          ? journal.state.snapshot.remoteRevision
          : null,
        todoPersistenceStatus: todo.state.status === "ready"
          ? todo.state.persistence.status
          : null,
        todoRemoteRevision: todo.state.status === "ready"
          ? todo.state.snapshot.remoteRevision
          : null,
        workspacePersistenceStatus: workspace.status === "ready"
          ? workspace.persistence.status
          : null,
        workspaceRemoteRevision: workspace.status === "ready"
          ? workspace.remoteRevision
          : null,
      };
    },
    source: changeEvents,
  });

  snapshot = {
    builtIns: {
      catalog: projectBuiltInCatalog(),
      journal: journalSlot.getSnapshot(),
      todo: todoSlot.getSnapshot(),
    },
    catalog: projectRepositoryCatalog(),
    navigation: navigationController.getState(),
    referenceResolutionGeneration,
    search: searchController.getState(),
    workspace: workspaceSlot.getSnapshot(),
  };

  return {
    apiAccessAdministration,
    operationAdministration,
    journal: journalFacade,
    journalReferenceResolver,
    search: searchFacade,
    todo: todoFacade,
    workspace: workspaceFacade,
    consumeWorkspaceNoteDestination: navigationController.consume,
    async createRepository(input) {
      await workspaceSlot.flushReady();
      await repositoryCatalogController.createRepository(input);
    },
    async deleteRepository(input) {
      const catalog = repositoryCatalogController.getSnapshot();
      const workspace = workspaceSlot.getSnapshot();

      if (
        input.id !== catalog.activeDescriptor?.id ||
        workspace.status !== "ready"
      ) {
        await repositoryCatalogController.deleteRepository(input);
        return;
      }
      const prepared = await workspaceFacade.prepareForRepositoryRemoval();

      try {
        await repositoryCatalogController.deleteRepository(input);
      } catch (error) {
        prepared.resume();
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      repositoryCatalogController.stop();
      builtInCatalogController.stop();
      unsubscribeCatalog();
      unsubscribeBuiltIns();
      checkpointReloadReconciler?.dispose();
      navigationController.dispose();
      searchController.dispose();
      workspaceSlot.dispose();
      journalSlot.dispose();
      todoSlot.dispose();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    async flushLoadedContent() {
      const current = snapshot;
      const operations: Promise<unknown>[] = [];

      if (current.workspace.status === "ready") {
        operations.push(workspaceFacade.synchronizePendingChanges());
      }
      if (current.builtIns.journal.state.status === "ready") {
        operations.push(journalFacade.synchronizePendingChanges());
      }
      if (current.builtIns.todo.state.status === "ready") {
        operations.push(todoFacade.synchronizePendingChanges());
      }
      await Promise.all(operations);
    },
    reloadBuiltIns: builtInCatalogController.reload,
    async refreshRepositories() {
      await workspaceSlot.flushReady();
      await repositoryCatalogController.reload();
    },
    renameRepository: repositoryCatalogController.renameRepository,
    requestWorkspaceNoteDestination: navigationController.request,
    retryBuiltIn: builtInCatalogController.retry,
    retryWorkspaceNoteDestination: navigationController.retry,
    async selectRepository(repositoryId) {
      await workspaceSlot.synchronizeReady();
      await repositoryCatalogController.selectRepository(repositoryId);
    },
    start() {
      if (disposed || started) return;
      started = true;
      repositoryCatalogController.start();
      builtInCatalogController.start();
      workspaceSlot.reconcile(
        repositoryCatalogController.getSnapshot().activeDescriptor,
      );
      workspaceSlot.start();
      journalSlot.start();
      todoSlot.start();
      checkpointReloadReconciler?.start();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
