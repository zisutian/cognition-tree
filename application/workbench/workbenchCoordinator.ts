// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalWorkspaceNoteDestination,
} from "../journal/journalExternalReferences";
import type {
  BuiltInCatalogApplication,
} from "../repository/builtInCatalogController";
import type {
  BuiltInCatalog,
  BuiltInDescriptor,
  BuiltInId,
  JournalRepository,
  TodoRepository,
} from "../repository/builtInRepository";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RenameRepositoryRequest,
  RepositoryCatalogState,
} from "../repository/repositoryCatalog";
import type { RepositoryNavigation } from "../repository/repositoryNavigation";
import type {
  BuiltInSessionSummary,
  RepositoryApplication,
} from "../repository/repositoryApplication";
import type { WorkspaceRepositoryDescriptor } from "../repository/workspaceRepositoryCatalog";
import type { JournalSessionState } from "../journal/journalSessionController";
import type { TodoSessionState } from "../todo/todoSessionController";

export type PendingWorkspaceNoteDestination =
  JournalWorkspaceNoteDestination & { requestId: number };

export type RepositoryCatalogProjection = {
  activeDescriptor: WorkspaceRepositoryDescriptor | null;
  catalogLabel: string;
  createRepository(input: CreateRepositoryRequest): Promise<unknown>;
  deleteRepository(input: DeleteRepositoryRequest): Promise<unknown>;
  reload(): Promise<void>;
  renameRepository(input: RenameRepositoryRequest): Promise<unknown>;
  selectRepository(repositoryId: string): Promise<void>;
  state: RepositoryCatalogState;
};

type BuiltInSessionProjection = {
  discardPendingChangesAndReload(): Promise<void>;
  reload(): Promise<void>;
  requestSync(): void;
  state: JournalSessionState | TodoSessionState;
};

export function createJournalCatalogGeneration(
  state: RepositoryCatalogState,
) {
  return state.status === "ready"
    ? JSON.stringify(state.repositories.map(({ id, label, labelIssue }) => [
        id,
        label,
        labelIssue,
      ]))
    : state.status;
}

export function findBuiltInDescriptor(
  builtIns: BuiltInCatalogApplication,
  id: BuiltInId,
) {
  return builtIns.state.status === "ready"
    ? builtIns.state.repositories.find((descriptor) => descriptor.id === id) ??
      null
    : null;
}

export function createBuiltInConnectionKey(
  descriptor: BuiltInDescriptor | null,
) {
  return descriptor
    ? JSON.stringify({ id: descriptor.id, location: descriptor.location })
    : "";
}

export function openJournalRepository(
  catalog: BuiltInCatalog,
  descriptor: BuiltInDescriptor | null,
): JournalRepository | null {
  return descriptor ? catalog.openJournal(descriptor) : null;
}

export function openTodoRepository(
  catalog: BuiltInCatalog,
  descriptor: BuiltInDescriptor | null,
): TodoRepository | null {
  return descriptor ? catalog.openTodo(descriptor) : null;
}

export function projectBuiltInSessionSummary(
  session: BuiltInSessionProjection,
): BuiltInSessionSummary {
  switch (session.state.status) {
    case "unavailable":
      return { status: "unavailable" };
    case "loading":
      return { status: "loading" };
    case "failed":
      return {
        errorMessage: session.state.errorMessage,
        reload: session.reload,
        status: "failed",
      };
    case "ready":
      return {
        discardPendingChangesAndReload:
          session.discardPendingChangesAndReload,
        persistence: session.state.persistence,
        reload: session.reload,
        requestSync: session.requestSync,
        status: "ready",
      };
  }
}

export function createRepositoryApplication({
  builtInSessions,
  builtIns,
  catalog,
  createRepository = async (input) => {
    await catalog.createRepository(input);
  },
  deleteRepository = async (input) => {
    await catalog.deleteRepository(input);
  },
  navigation,
  refreshRepositories = catalog.reload,
  renameRepository = async (input) => {
    await catalog.renameRepository(input);
  },
  selectRepository = catalog.selectRepository,
  session,
}: {
  builtInSessions: RepositoryApplication["builtIns"]["sessions"];
  builtIns: BuiltInCatalogApplication;
  catalog: RepositoryCatalogProjection;
  createRepository?: (input: CreateRepositoryRequest) => Promise<void>;
  deleteRepository?: (input: DeleteRepositoryRequest) => Promise<void>;
  navigation: RepositoryNavigation;
  refreshRepositories?: () => Promise<void>;
  renameRepository?: (input: RenameRepositoryRequest) => Promise<void>;
  selectRepository?: (repositoryId: string) => Promise<void>;
  session: RepositoryApplication["session"];
}): RepositoryApplication {
  return {
    activeDescriptor: catalog.activeDescriptor,
    builtIns: { catalog: builtIns, sessions: builtInSessions },
    catalogLabel: catalog.catalogLabel,
    catalogState: catalog.state,
    createRepository,
    deleteRepository,
    navigation,
    refreshRepositories,
    renameRepository,
    selectRepository,
    session,
  };
}

export type WorkbenchNavigationCoordinator = {
  consume(requestId: number): void;
  getSnapshot(): PendingWorkspaceNoteDestination | null;
  request(destination: JournalWorkspaceNoteDestination): number;
  subscribe(listener: () => void): () => void;
};

export function createWorkbenchNavigationCoordinator(): WorkbenchNavigationCoordinator {
  const listeners = new Set<() => void>();
  let nextRequestId = 1;
  let snapshot: PendingWorkspaceNoteDestination | null = null;
  const publish = () => listeners.forEach((listener) => listener());

  return {
    consume(requestId) {
      if (snapshot?.requestId !== requestId) return;
      snapshot = null;
      publish();
    },
    getSnapshot() {
      return snapshot;
    },
    request(destination) {
      const requestId = nextRequestId++;

      snapshot = { ...destination, requestId };
      publish();
      return requestId;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
