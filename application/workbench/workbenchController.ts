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
} from "../repository/builtInRepository";
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
import type { WorkspaceRepositoryContent } from "../repository/workspaceRepository";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import type {
  DomainChangeEventSource,
  DomainRevisionCheckpoint,
} from "../sync/domainChangeEvents";
import {
  createSearchController,
  type SearchController,
  type SearchControllerActions,
  type SearchControllerState,
} from "../search/searchController";
import type { SearchResourceVersion } from "../search/searchQuery";
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

export type { WorkbenchNavigationState } from "./workspaceNoteNavigationController";
export type { WorkbenchWorkspaceSession } from "./workspaceSessionSlot";
export type { WorkbenchBuiltInSession } from "./builtInSessionSlot";

export type WorkbenchRepositoryCatalogSnapshot = Omit<
  RepositoryCatalogControllerSnapshot,
  "repository"
>;

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
  | "keepLocalConflictAndSynchronize"
  | "loadConflictUnitIds"
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
  | "loadConflictUnitIds"
  | "mutate"
  | "mutatePrepared"
  | "recoverLocalConflictCopy"
  | "reload"
  | "requestSync"
  | "useRemoteConflictAndSynchronize"
>;

export type WorkbenchSearchFacade = SearchControllerActions;

export type WorkbenchController = {
  apiAccessAdministration: ApiAccessAdministration;
  journal: WorkbenchBuiltInFacade<JournalSessionController>;
  journalReferenceResolver: JournalWorkspaceReferenceResolver;
  search: WorkbenchSearchFacade;
  todo: WorkbenchBuiltInFacade<TodoSessionController>;
  workspace: WorkbenchWorkspaceFacade;
  consumeWorkspaceNoteDestination(requestId: number): void;
  createRepository(input: CreateRepositoryRequest): Promise<void>;
  deleteRepository(input: DeleteRepositoryRequest): Promise<void>;
  discardJournalPendingChangesAndReload(): Promise<void>;
  discardTodoPendingChangesAndReload(): Promise<void>;
  dispose(): void;
  getSnapshot(): WorkbenchControllerSnapshot;
  reloadBuiltIns(): Promise<void>;
  refreshRepositories(): Promise<void>;
  reloadJournal(): Promise<void>;
  reloadTodo(): Promise<void>;
  renameRepository(input: RenameRepositoryRequest): Promise<void>;
  requestJournalSync(): void;
  requestTodoSync(): void;
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
  builtInCatalog: BuiltInCatalog;
  changeEvents?: DomainChangeEventSource;
  createInitialWorkspaceContent(label: string): WorkspaceRepositoryContent;
  createSearchVersion(value: unknown): Promise<SearchResourceVersion>;
  scheduler: ApplicationScheduler;
  timezoneOffsetMinutes?: () => number;
  workspaceCatalog: WorkspaceRepositoryCatalog;
  workspaceCommandDependencies: SessionCommandDependencies;
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
  scheduler,
  timezoneOffsetMinutes = () => 0,
  workspaceCatalog,
  workspaceCommandDependencies,
}: WorkbenchControllerOptions): WorkbenchController {
  const repositoryCatalogController = createRepositoryCatalogController({
    activeRepositorySelection,
    catalog: workspaceCatalog,
    createInitialContent: createInitialWorkspaceContent,
    scheduler,
  });
  const builtInCatalogController = createBuiltInCatalogController(
    builtInCatalog,
  );
  const listeners = new Set<() => void>();
  let disposed = false;
  let referenceResolutionGeneration = 0;
  let started = false;
  let snapshot: WorkbenchControllerSnapshot;
  let latestCheckpoint: DomainRevisionCheckpoint | null = null;
  let activeChangeStreamId: string | null = null;
  let workspaceCatalogChangeSequence = -1;
  let catalogAttemptedSequence = -1;
  let catalogReloading = false;
  const workspaceAttemptedSequences = new Map<string, number>();
  let journalAttemptedSequence = -1;
  let journalReloading = false;
  let todoAttemptedSequence = -1;
  let todoReloading = false;
  let workspaceReloading = false;
  let searchController: SearchController;

  const projectBuiltInCatalog = () => ({
    catalogLabel: builtInCatalogController.catalogLabel,
    state: builtInCatalogController.getState(),
  });
  const projectRepositoryCatalog = (): WorkbenchRepositoryCatalogSnapshot => {
    const { repository: _repository, ...projected } =
      repositoryCatalogController.getSnapshot();

    return projected;
  };
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
    reconcileExternalChanges();
  };
  const workspaceSlot = createWorkspaceSessionSlot({
    commandDependencies: workspaceCommandDependencies,
    onChange() {
      publish(true);
      navigationController.notifyInputsChanged();
    },
    scheduler,
  });
  const journalSlot = createBuiltInSessionSlot({
    createController: (descriptor: BuiltInDescriptor | null) =>
      createJournalSessionController(
        descriptor ? builtInCatalog.openJournal(descriptor) : null,
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
        descriptor ? builtInCatalog.openTodo(descriptor) : null,
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
    workspaceCatalog,
  });

  searchController = createSearchController({
    onChange: () => publish(),
    query: searchQuery,
  });
  const reconcileExternalChanges = () => {
    if (disposed || !started || !latestCheckpoint) return;
    const sequence = latestCheckpoint.sequence;
    const catalog = repositoryCatalogController.getSnapshot();
    const knownRepositoryIds = catalog.state.status === "ready"
      ? catalog.state.repositories.map(({ id }) => id).sort()
      : [];
    const checkpointRepositoryIds =
      Object.keys(latestCheckpoint.workspaces).sort();
    const catalogMismatch =
      knownRepositoryIds.length !== checkpointRepositoryIds.length ||
      knownRepositoryIds.some(
        (repositoryId, index) =>
          repositoryId !== checkpointRepositoryIds[index],
      );

    if (
      catalog.state.status === "ready" &&
      !catalogReloading &&
      catalogAttemptedSequence < sequence &&
      (catalogMismatch ||
        catalogAttemptedSequence < workspaceCatalogChangeSequence)
    ) {
      catalogAttemptedSequence = sequence;
      catalogReloading = true;
      void repositoryCatalogController.reload()
        .catch(() => undefined)
        .finally(() => {
          catalogReloading = false;
          reconcileExternalChanges();
        });
    }
    const activeRepositoryId =
      catalog.activeDescriptor?.id;
    const workspace = workspaceSlot.getSnapshot();

    if (
      activeRepositoryId &&
      workspace.status === "ready" &&
      latestCheckpoint.workspaces[activeRepositoryId] &&
      workspace.remoteRevision !==
        latestCheckpoint.workspaces[activeRepositoryId] &&
      !workspaceReloading &&
      (workspaceAttemptedSequences.get(activeRepositoryId) ?? -1) < sequence
    ) {
      workspaceAttemptedSequences.set(activeRepositoryId, sequence);
      workspaceReloading = true;
      void workspaceFacade.reload()
        .catch(() => undefined)
        .finally(() => {
          workspaceReloading = false;
          reconcileExternalChanges();
        });
    }
    const journal = journalSlot.getSnapshot();

    if (
      journal.state.status === "ready" &&
      latestCheckpoint.journal &&
      journal.state.snapshot.remoteRevision !== latestCheckpoint.journal &&
      !journalReloading &&
      journalAttemptedSequence < sequence
    ) {
      journalAttemptedSequence = sequence;
      journalReloading = true;
      void journalFacade.reload()
        .catch(() => undefined)
        .finally(() => {
          journalReloading = false;
          reconcileExternalChanges();
        });
    }
    const todo = todoSlot.getSnapshot();

    if (
      todo.state.status === "ready" &&
      latestCheckpoint.todo &&
      todo.state.snapshot.remoteRevision !== latestCheckpoint.todo &&
      !todoReloading &&
      todoAttemptedSequence < sequence
    ) {
      todoAttemptedSequence = sequence;
      todoReloading = true;
      void todoFacade.reload()
        .catch(() => undefined)
        .finally(() => {
          todoReloading = false;
          reconcileExternalChanges();
        });
    }
  };
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
      return createJournalWorkspaceReferenceResolver(workspaceCatalog, {
        workspaceSnapshot: currentWorkspaceReferenceSnapshot(),
      }).resolve(references);
    },
  };
  const reconcileBuiltInSessions = () => {
    const state = builtInCatalogController.getState();

    journalSlot.reconcile(findBuiltInDescriptor(state, "journal"));
    todoSlot.reconcile(findBuiltInDescriptor(state, "todo"));
  };
  const unsubscribeCatalog = repositoryCatalogController.subscribe(() => {
    workspaceSlot.reconcile(
      repositoryCatalogController.getSnapshot().repository,
    );
    publish(true);
    navigationController.notifyInputsChanged();
  });
  const unsubscribeBuiltIns = builtInCatalogController.subscribe(() => {
    reconcileBuiltInSessions();
    publish();
  });
  const unsubscribeChangeEvents = changeEvents?.subscribe((event) => {
    if (activeChangeStreamId !== event.streamId) {
      activeChangeStreamId = event.streamId;
      latestCheckpoint = null;
      workspaceCatalogChangeSequence = -1;
      catalogAttemptedSequence = -1;
      workspaceAttemptedSequences.clear();
      journalAttemptedSequence = -1;
      todoAttemptedSequence = -1;
    }
    if (
      latestCheckpoint &&
      event.sequence < latestCheckpoint.sequence
    ) {
      return;
    }
    latestCheckpoint = event.checkpoint;
    if (event.changedDomains.workspaceCatalog) {
      workspaceCatalogChangeSequence = event.sequence;
    }
    reconcileExternalChanges();
  }) ?? (() => undefined);
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
    keepLocalConflictAndSynchronize: (...args) =>
      requireWorkspaceController().keepLocalConflictAndSynchronize(...args),
    loadConflictUnitIds: (...args) =>
      requireWorkspaceController().loadConflictUnitIds(...args),
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
    loadConflictUnitIds: (...args) =>
      journalSlot.getController().loadConflictUnitIds(...args),
    mutate: (...args) => journalSlot.getController().mutate(...args),
    mutatePrepared: (...args) =>
      journalSlot.getController().mutatePrepared(...args),
    recoverLocalConflictCopy: (...args) =>
      journalSlot.getController().recoverLocalConflictCopy(...args),
    reload: (...args) => journalSlot.getController().reload(...args),
    requestSync: (...args) =>
      journalSlot.getController().requestSync(...args),
    useRemoteConflictAndSynchronize: (...args) =>
      journalSlot.getController().useRemoteConflictAndSynchronize(...args),
  };
  const todoFacade: WorkbenchBuiltInFacade<TodoSessionController> = {
    discardPendingChangesAndReload: (...args) =>
      todoSlot.getController().discardPendingChangesAndReload(...args),
    keepLocalConflictAndSynchronize: (...args) =>
      todoSlot.getController().keepLocalConflictAndSynchronize(...args),
    loadConflictUnitIds: (...args) =>
      todoSlot.getController().loadConflictUnitIds(...args),
    mutate: (...args) => todoSlot.getController().mutate(...args),
    mutatePrepared: (...args) =>
      todoSlot.getController().mutatePrepared(...args),
    recoverLocalConflictCopy: (...args) =>
      todoSlot.getController().recoverLocalConflictCopy(...args),
    reload: (...args) => todoSlot.getController().reload(...args),
    requestSync: (...args) => todoSlot.getController().requestSync(...args),
    useRemoteConflictAndSynchronize: (...args) =>
      todoSlot.getController().useRemoteConflictAndSynchronize(...args),
  };
  const searchFacade: WorkbenchSearchFacade = {
    loadMore: searchController.loadMore,
    search: searchController.search,
    updateDraft: searchController.updateDraft,
    updateScrollTop: searchController.updateScrollTop,
  };

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
    discardJournalPendingChangesAndReload: () =>
      journalFacade.discardPendingChangesAndReload(),
    discardTodoPendingChangesAndReload: () =>
      todoFacade.discardPendingChangesAndReload(),
    dispose() {
      if (disposed) return;
      disposed = true;
      repositoryCatalogController.stop();
      builtInCatalogController.stop();
      unsubscribeCatalog();
      unsubscribeBuiltIns();
      unsubscribeChangeEvents();
      changeEvents?.dispose();
      navigationController.dispose();
      searchController.dispose();
      workspaceSlot.dispose();
      journalSlot.dispose();
      todoSlot.dispose();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    reloadBuiltIns: builtInCatalogController.reload,
    async refreshRepositories() {
      await workspaceSlot.flushReady();
      await repositoryCatalogController.reload();
    },
    reloadJournal: journalFacade.reload,
    reloadTodo: todoFacade.reload,
    renameRepository: repositoryCatalogController.renameRepository,
    requestJournalSync: journalFacade.requestSync,
    requestTodoSync: todoFacade.requestSync,
    requestWorkspaceNoteDestination: navigationController.request,
    retryBuiltIn: builtInCatalogController.retry,
    retryWorkspaceNoteDestination: navigationController.retry,
    async selectRepository(repositoryId) {
      await workspaceSlot.flushReady();
      await repositoryCatalogController.selectRepository(repositoryId);
    },
    start() {
      if (disposed || started) return;
      started = true;
      repositoryCatalogController.start();
      builtInCatalogController.start();
      workspaceSlot.reconcile(
        repositoryCatalogController.getSnapshot().repository,
      );
      workspaceSlot.start();
      journalSlot.start();
      todoSlot.start();
      changeEvents?.start();
      reconcileExternalChanges();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
