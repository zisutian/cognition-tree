// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalWorkspaceNoteDestination,
  JournalWorkspaceReferenceResolver,
} from "../journal/journalExternalReferences";
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
  builtInCatalog: BuiltInCatalog;
  createInitialWorkspaceContent(label: string): WorkspaceRepositoryContent;
  scheduler: ApplicationScheduler;
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
  builtInCatalog,
  createInitialWorkspaceContent,
  scheduler,
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
      ),
    onChange: () => publish(),
  });
  const todoSlot = createBuiltInSessionSlot({
    createController: (descriptor: BuiltInDescriptor | null) =>
      createTodoSessionController(
        descriptor ? builtInCatalog.openTodo(descriptor) : null,
        scheduler,
      ),
    onChange: () => publish(),
  });
  const navigationController = createWorkspaceNoteNavigationController({
    getCatalog: repositoryCatalogController.getSnapshot,
    getWorkspace: workspaceSlot.getSnapshot,
    onChange: () => publish(),
    selectRepository: repositoryCatalogController.selectRepository,
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

  snapshot = {
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
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
