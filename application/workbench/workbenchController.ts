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
  createWorkspaceSessionController,
  type WorkspaceSessionController,
  type WorkspaceSessionControllerState,
} from "../workspace/session/workspaceSessionController";
import {
  createJournalWorkspaceReferenceResolver,
  type JournalWorkspaceReferenceSnapshot,
} from "./journalWorkspaceReferences";

export type WorkbenchNavigationState =
  | { status: "idle" }
  | {
      destination: JournalWorkspaceNoteDestination;
      requestId: number;
      status: "pending" | "ready";
    }
  | {
      destination: JournalWorkspaceNoteDestination;
      errorMessage: string;
      requestId: number;
      status: "failed";
    };

export type WorkbenchWorkspaceSession =
  | { status: "absent" }
  | ({ controller: WorkspaceSessionController } &
      WorkspaceSessionControllerState);

export type WorkbenchBuiltInSession<Controller, State> = {
  controller: Controller;
  state: State;
};

export type WorkbenchControllerSnapshot = {
  builtIns: {
    catalog: BuiltInCatalogApplication;
    journal: WorkbenchBuiltInSession<
      JournalSessionController,
      ReturnType<JournalSessionController["getState"]>
    >;
    todo: WorkbenchBuiltInSession<
      TodoSessionController,
      ReturnType<TodoSessionController["getState"]>
    >;
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

function builtInConnectionKey(descriptor: BuiltInDescriptor | null) {
  return descriptor
    ? JSON.stringify({ id: descriptor.id, location: descriptor.location })
    : "";
}

function findBuiltInDescriptor(
  state: ReturnType<BuiltInCatalogController["getState"]>,
  id: BuiltInId,
) {
  return state.status === "ready"
    ? state.repositories.find((descriptor) => descriptor.id === id) ?? null
    : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
  let started = false;
  let nextNavigationRequestId = 1;
  let navigation: WorkbenchNavigationState = { status: "idle" };
  let navigationProcessing = false;
  let referenceResolutionGeneration = 0;
  let workspaceController: WorkspaceSessionController | null = null;
  let workspaceRepository = repositoryCatalogController.getSnapshot().repository;
  let workspaceState: WorkspaceSessionControllerState | null = null;
  let unsubscribeWorkspace: (() => void) | null = null;
  let journalConnectionKey = "";
  let todoConnectionKey = "";
  let journalController = createJournalSessionController(null, scheduler);
  let todoController = createTodoSessionController(null, scheduler);
  let journalState = journalController.getState();
  let todoState = todoController.getState();
  let unsubscribeJournal: (() => void) | null = null;
  let unsubscribeTodo: (() => void) | null = null;
  let snapshot: WorkbenchControllerSnapshot;

  const currentWorkspaceReferenceSnapshot = ():
    JournalWorkspaceReferenceSnapshot | null => {
    const catalog = repositoryCatalogController.getSnapshot();

    return workspaceState?.status === "ready" && catalog.activeDescriptor
      ? {
          repositoryId: catalog.activeDescriptor.id,
          workspace: workspaceState.workspace.data,
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
  const projectBuiltInCatalog = (): BuiltInCatalogApplication => ({
    catalogLabel: builtInCatalogController.catalogLabel,
    reload: builtInCatalogController.reload,
    retry: builtInCatalogController.retry,
    state: builtInCatalogController.getState(),
  });
  const projectWorkspace = (): WorkbenchWorkspaceSession =>
    workspaceController && workspaceState
      ? { controller: workspaceController, ...workspaceState }
      : { status: "absent" };
  const projectSnapshot = (): WorkbenchControllerSnapshot => ({
    builtIns: {
      catalog: projectBuiltInCatalog(),
      journal: { controller: journalController, state: journalState },
      todo: { controller: todoController, state: todoState },
    },
    catalog: repositoryCatalogController.getSnapshot(),
    journalReferenceResolver,
    navigation,
    referenceResolutionGeneration,
    workspace: projectWorkspace(),
  });
  const publish = (referencesChanged = false) => {
    if (disposed) return;
    if (referencesChanged) referenceResolutionGeneration += 1;
    snapshot = projectSnapshot();
    listeners.forEach((listener) => listener());
  };

  const installJournalController = (descriptor: BuiltInDescriptor | null) => {
    const connectionKey = builtInConnectionKey(descriptor);

    if (connectionKey === journalConnectionKey) return;
    journalConnectionKey = connectionKey;
    unsubscribeJournal?.();
    journalController.dispose();
    journalController = createJournalSessionController(
      descriptor ? builtInCatalog.openJournal(descriptor) : null,
      scheduler,
    );
    journalState = journalController.getState();
    unsubscribeJournal = journalController.subscribe(() => {
      journalState = journalController.getState();
      publish();
    });
    if (started) journalController.start();
  };
  const installTodoController = (descriptor: BuiltInDescriptor | null) => {
    const connectionKey = builtInConnectionKey(descriptor);

    if (connectionKey === todoConnectionKey) return;
    todoConnectionKey = connectionKey;
    unsubscribeTodo?.();
    todoController.dispose();
    todoController = createTodoSessionController(
      descriptor ? builtInCatalog.openTodo(descriptor) : null,
      scheduler,
    );
    todoState = todoController.getState();
    unsubscribeTodo = todoController.subscribe(() => {
      todoState = todoController.getState();
      publish();
    });
    if (started) todoController.start();
  };
  const reconcileBuiltInSessions = () => {
    const state = builtInCatalogController.getState();

    installJournalController(findBuiltInDescriptor(state, "journal"));
    installTodoController(findBuiltInDescriptor(state, "todo"));
  };

  const processNavigation = async () => {
    if (
      navigationProcessing ||
      navigation.status !== "pending" ||
      disposed
    ) {
      return;
    }
    const request = navigation;
    const catalog = repositoryCatalogController.getSnapshot();

    if (catalog.state.status === "loading") return;
    if (catalog.state.status === "failed") {
      navigation = {
        ...request,
        errorMessage: catalog.state.errorMessage,
        status: "failed",
      };
      publish();
      return;
    }
    if (!catalog.state.repositories.some(({ id }) =>
      id === request.destination.repositoryId
    )) {
      navigation = {
        ...request,
        errorMessage: "引用目标仓库不存在。",
        status: "failed",
      };
      publish();
      return;
    }

    navigationProcessing = true;
    try {
      if (catalog.activeDescriptor?.id !== request.destination.repositoryId) {
        if (workspaceState?.status === "ready") {
          await workspaceController!.flushPendingChanges();
        }
        await repositoryCatalogController.selectRepository(
          request.destination.repositoryId,
        );
      } else if (workspaceState?.status === "ready") {
        navigation = { ...request, status: "ready" };
        publish();
      } else if (workspaceState?.status === "failed") {
        navigation = {
          ...request,
          errorMessage: workspaceState.errorMessage,
          status: "failed",
        };
        publish();
      }
    } catch (error) {
      if (navigation.requestId === request.requestId) {
        navigation = {
          ...request,
          errorMessage: errorMessage(error, "无法打开日记引用目标。"),
          status: "failed",
        };
        publish();
      }
    } finally {
      navigationProcessing = false;
      if (
        navigation.status === "pending" &&
        (navigation.requestId !== request.requestId ||
          (repositoryCatalogController.getSnapshot().activeDescriptor?.id ===
              navigation.destination.repositoryId &&
            (workspaceState?.status === "ready" ||
              workspaceState?.status === "failed")))
      ) {
        void processNavigation();
      }
    }
  };

  const installWorkspaceController = () => {
    const repository = repositoryCatalogController.getSnapshot().repository;

    if (repository === workspaceRepository && workspaceController) return;
    if (repository === workspaceRepository && !repository) return;
    unsubscribeWorkspace?.();
    unsubscribeWorkspace = null;
    workspaceController?.dispose();
    workspaceController = null;
    workspaceState = null;
    workspaceRepository = repository;
    if (repository) {
      const controller = createWorkspaceSessionController({
        commandDependencies: workspaceCommandDependencies,
        repository,
        scheduler,
      });

      workspaceController = controller;
      workspaceState = controller.getState();
      unsubscribeWorkspace = controller.subscribe(() => {
        workspaceState = controller.getState();
        publish(true);
        void processNavigation();
      });
      if (started) controller.start();
    }
  };

  const unsubscribeCatalog = repositoryCatalogController.subscribe(() => {
    installWorkspaceController();
    publish(true);
    void processNavigation();
  });
  const unsubscribeBuiltIns = builtInCatalogController.subscribe(() => {
    reconcileBuiltInSessions();
    publish();
  });

  unsubscribeJournal = journalController.subscribe(() => {
    journalState = journalController.getState();
    publish();
  });
  unsubscribeTodo = todoController.subscribe(() => {
    todoState = todoController.getState();
    publish();
  });
  snapshot = projectSnapshot();

  const flushReadyWorkspace = async () => {
    if (workspaceState?.status === "ready") {
      await workspaceController!.flushPendingChanges();
    }
  };

  return {
    consumeWorkspaceNoteDestination(requestId) {
      if (navigation.status !== "idle" && navigation.requestId === requestId) {
        navigation = { status: "idle" };
        publish();
      }
    },
    async createRepository(input) {
      await flushReadyWorkspace();
      await repositoryCatalogController.createRepository(input);
    },
    async deleteRepository(input) {
      const activeId = repositoryCatalogController.getSnapshot()
        .activeDescriptor?.id;

      if (input.id !== activeId || workspaceState?.status !== "ready") {
        await repositoryCatalogController.deleteRepository(input);
        return;
      }
      const prepared = await workspaceController!.prepareForRepositoryRemoval();

      try {
        await repositoryCatalogController.deleteRepository(input);
      } catch (error) {
        prepared.resume();
        throw error;
      }
    },
    discardJournalPendingChangesAndReload: () =>
      journalController.discardPendingChangesAndReload(),
    discardTodoPendingChangesAndReload: () =>
      todoController.discardPendingChangesAndReload(),
    dispose() {
      if (disposed) return;
      disposed = true;
      repositoryCatalogController.stop();
      builtInCatalogController.stop();
      unsubscribeCatalog();
      unsubscribeBuiltIns();
      unsubscribeWorkspace?.();
      unsubscribeJournal?.();
      unsubscribeTodo?.();
      workspaceController?.dispose();
      journalController.dispose();
      todoController.dispose();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    async refreshRepositories() {
      await flushReadyWorkspace();
      await repositoryCatalogController.reload();
    },
    reloadJournal: () => journalController.reload(),
    reloadTodo: () => todoController.reload(),
    renameRepository: (input) =>
      repositoryCatalogController.renameRepository(input),
    requestJournalSync: () => journalController.requestSync(),
    requestTodoSync: () => todoController.requestSync(),
    requestWorkspaceNoteDestination(destination) {
      const requestId = nextNavigationRequestId++;

      navigation = { destination, requestId, status: "pending" };
      publish();
      void processNavigation();
      return requestId;
    },
    retryBuiltIn: (id) => builtInCatalogController.retry(id),
    retryWorkspaceNoteDestination(requestId) {
      if (navigation.status === "failed" && navigation.requestId === requestId) {
        navigation = {
          destination: navigation.destination,
          requestId,
          status: "pending",
        };
        publish();
        void processNavigation();
      }
    },
    async selectRepository(repositoryId) {
      await flushReadyWorkspace();
      await repositoryCatalogController.selectRepository(repositoryId);
    },
    start() {
      if (started || disposed) return;
      started = true;
      repositoryCatalogController.start();
      builtInCatalogController.start();
      journalController.start();
      todoController.start();
      installWorkspaceController();
      workspaceController?.start();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
