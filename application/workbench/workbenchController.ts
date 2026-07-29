// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalWorkspaceNoteDestination,
  JournalWorkspaceReferenceResolver,
} from "../journal/journalExternalReferences";
import type {
  ApiAccessAdministration,
} from "../apiAccess/apiAccessAdministration";
import {
  createJournalSessionController,
  type JournalSessionController,
} from "../journal/journalSessionController";
import {
  createBuiltInCatalogController,
  type BuiltInCatalogApplication,
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
  createTodoSessionController,
  type TodoSessionController,
} from "../todo/todoSessionController";
import type { SessionCommandDependencies } from "../workspace/session/sessionCommands";
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

export type { WorkbenchNavigationState } from "./workspaceNoteNavigationController";
export type { WorkbenchWorkspaceSession } from "./workspaceSessionSlot";
export type { WorkbenchBuiltInSession } from "./builtInSessionSlot";

export type WorkbenchControllerSnapshot = {
  apiAccessAdministration: ApiAccessAdministration | null;
  builtIns: {
    catalog: BuiltInCatalogApplication;
    journal: WorkbenchBuiltInSession<JournalSessionController>;
    todo: WorkbenchBuiltInSession<TodoSessionController>;
  };
  catalog: RepositoryCatalogControllerSnapshot;
  journalReferenceResolver: JournalWorkspaceReferenceResolver;
  navigation: WorkbenchNavigationState;
  referenceResolutionGeneration: number;
  workspace: WorkbenchWorkspaceSession;
};

export type WorkbenchController = {
  consumeWorkspaceNoteDestination(requestId: number): void;
  createRepository(input: CreateRepositoryRequest): Promise<void>;
  deleteRepository(input: DeleteRepositoryRequest): Promise<void>;
  discardJournalPendingChangesAndReload(): Promise<void>;
  discardTodoPendingChangesAndReload(): Promise<void>;
  dispose(): void;
  getSnapshot(): WorkbenchControllerSnapshot;
  refreshRepositories(): Promise<void>;
  reloadJournal(): Promise<void>;
  reloadTodo(): Promise<void>;
  renameRepository(input: RenameRepositoryRequest): Promise<void>;
  requestJournalSync(): void;
  requestTodoSync(): void;
  requestWorkspaceNoteDestination(
    destination: JournalWorkspaceNoteDestination,
  ): number;
  retryBuiltIn(id: BuiltInId): Promise<void>;
  retryWorkspaceNoteDestination(requestId: number): void;
  selectRepository(repositoryId: string): Promise<void>;
  start(): void;
  subscribe(listener: () => void): () => void;
};

type WorkbenchControllerOptions = {
  activeRepositorySelection: ActiveRepositorySelection;
  apiAccessAdministration?: ApiAccessAdministration;
  builtInCatalog: BuiltInCatalog;
  changeEvents?: DomainChangeEventSource;
  createInitialWorkspaceContent(label: string): WorkspaceRepositoryContent;
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
  let workspaceCatalogChangeSequence = -1;
  let catalogAttemptedSequence = -1;
  let catalogReloading = false;
  const workspaceAttemptedSequences = new Map<string, number>();
  let journalAttemptedSequence = -1;
  let journalReloading = false;
  let todoAttemptedSequence = -1;
  let todoReloading = false;
  let workspaceReloading = false;

  const projectBuiltInCatalog = (): BuiltInCatalogApplication => ({
    catalogLabel: builtInCatalogController.catalogLabel,
    reload: builtInCatalogController.reload,
    retry: builtInCatalogController.retry,
    state: builtInCatalogController.getState(),
  });
  const publish = (referencesChanged = false) => {
    if (disposed) return;
    if (referencesChanged) referenceResolutionGeneration += 1;
    snapshot = {
      apiAccessAdministration: apiAccessAdministration ?? null,
      builtIns: {
        catalog: projectBuiltInCatalog(),
        journal: journalSlot.getSnapshot(),
        todo: todoSlot.getSnapshot(),
      },
      catalog: repositoryCatalogController.getSnapshot(),
      journalReferenceResolver,
      navigation: navigationController.getState(),
      referenceResolutionGeneration,
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
    getCatalog: repositoryCatalogController.getSnapshot,
    getWorkspace: workspaceSlot.getSnapshot,
    onChange: () => publish(),
    selectRepository: repositoryCatalogController.selectRepository,
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
      void workspace.controller.reload()
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
      void journal.controller.reload()
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
      void todo.controller.reload()
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

  snapshot = {
    apiAccessAdministration: apiAccessAdministration ?? null,
    builtIns: {
      catalog: projectBuiltInCatalog(),
      journal: journalSlot.getSnapshot(),
      todo: todoSlot.getSnapshot(),
    },
    catalog: repositoryCatalogController.getSnapshot(),
    journalReferenceResolver,
    navigation: navigationController.getState(),
    referenceResolutionGeneration,
    workspace: workspaceSlot.getSnapshot(),
  };

  return {
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
      const prepared = await workspace.controller.prepareForRepositoryRemoval();

      try {
        await repositoryCatalogController.deleteRepository(input);
      } catch (error) {
        prepared.resume();
        throw error;
      }
    },
    discardJournalPendingChangesAndReload: () =>
      journalSlot.getSnapshot().controller.discardPendingChangesAndReload(),
    discardTodoPendingChangesAndReload: () =>
      todoSlot.getSnapshot().controller.discardPendingChangesAndReload(),
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
      workspaceSlot.dispose();
      journalSlot.dispose();
      todoSlot.dispose();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    async refreshRepositories() {
      await workspaceSlot.flushReady();
      await repositoryCatalogController.reload();
    },
    reloadJournal: () => journalSlot.getSnapshot().controller.reload(),
    reloadTodo: () => todoSlot.getSnapshot().controller.reload(),
    renameRepository: repositoryCatalogController.renameRepository,
    requestJournalSync: () =>
      journalSlot.getSnapshot().controller.requestSync(),
    requestTodoSync: () => todoSlot.getSnapshot().controller.requestSync(),
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
