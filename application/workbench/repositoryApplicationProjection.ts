// SPDX-License-Identifier: GPL-3.0-or-later

import type { RepositoryNavigation } from "../repository/repositoryNavigation";
import type {
  VersionedRepositoryConflictDetails,
} from "../persistence/versionedRepository";
import {
  createRepositoryApplication,
  type BuiltInSessionSummary,
  type RepositoryApplication,
  type RepositoryPersistenceState,
  type RepositorySessionState,
} from "../repository/repositoryApplication";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "./workbenchController";

type VersionedSessionProjectionState<AbsentStatus extends string> =
  | { status: AbsentStatus }
  | { status: "loading"; storageLabel: string }
  | { errorMessage: string; status: "failed"; storageLabel: string }
  | {
      persistence: RepositoryPersistenceState;
      status: "ready";
      storageLabel: string;
    };

type BuiltInSessionProjection = {
  discardPendingChangesAndReload(): Promise<void>;
  keepLocalConflictAndSynchronize(): Promise<void>;
  loadConflictDetails(): Promise<VersionedRepositoryConflictDetails<string>>;
  recoverLocalConflictCopy(): Promise<void>;
  reload(): Promise<void>;
  requestSync(): void;
  state: VersionedSessionProjectionState<"unavailable">;
  useRemoteConflictAndSynchronize(): Promise<void>;
};

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
        keepLocalConflictAndSynchronize:
          session.keepLocalConflictAndSynchronize,
        loadConflictDetails: session.loadConflictDetails,
        recoverLocalConflictCopy: session.recoverLocalConflictCopy,
        persistence: session.state.persistence,
        reload: session.reload,
        requestSync: session.requestSync,
        status: "ready",
        useRemoteConflictAndSynchronize:
          session.useRemoteConflictAndSynchronize,
      };
  }
}

type WorkspaceSessionProjection = {
  discardPendingChangesAndReload(): Promise<void>;
  keepLocalConflictAndSynchronize(): Promise<void>;
  loadConflictDetails(): Promise<VersionedRepositoryConflictDetails<string>>;
  recoverLocalConflictCopy(): Promise<void>;
  reload(): Promise<void>;
  state: VersionedSessionProjectionState<"absent">;
  useRemoteConflictAndSynchronize(): Promise<void>;
};

export function projectWorkspaceRepositorySessionSummary(
  session: WorkspaceSessionProjection,
): RepositorySessionState {
  const workspace = session.state;

  if (workspace.status === "absent") return workspace;
  if (workspace.status === "loading") {
    return { status: "loading", storageLabel: workspace.storageLabel };
  }
  if (workspace.status === "failed") {
    return {
      errorMessage: workspace.errorMessage,
      retry: session.reload,
      status: "failed",
      storageLabel: workspace.storageLabel,
    };
  }
  return {
    discardPendingChangesAndReload:
      session.discardPendingChangesAndReload,
    keepLocalConflictAndSynchronize:
      session.keepLocalConflictAndSynchronize,
    loadConflictDetails: session.loadConflictDetails,
    recoverLocalConflictCopy: session.recoverLocalConflictCopy,
    persistence: workspace.persistence,
    reload: session.reload,
    status: "ready",
    storageLabel: workspace.storageLabel,
    useRemoteConflictAndSynchronize:
      session.useRemoteConflictAndSynchronize,
  };
}

function projectBuiltInSessions(
  controller: WorkbenchController,
  snapshot: WorkbenchControllerSnapshot,
): Record<"journal" | "todo", BuiltInSessionSummary> {
  return {
    journal: projectBuiltInSessionSummary({
      discardPendingChangesAndReload:
        controller.journal.discardPendingChangesAndReload,
      keepLocalConflictAndSynchronize:
        controller.journal.keepLocalConflictAndSynchronize,
      loadConflictDetails: controller.journal.loadConflictDetails,
      recoverLocalConflictCopy: controller.journal.recoverLocalConflictCopy,
      reload: controller.journal.reload,
      requestSync: controller.journal.requestSync,
      state: snapshot.builtIns.journal.state,
      useRemoteConflictAndSynchronize:
        controller.journal.useRemoteConflictAndSynchronize,
    }),
    todo: projectBuiltInSessionSummary({
      discardPendingChangesAndReload:
        controller.todo.discardPendingChangesAndReload,
      keepLocalConflictAndSynchronize:
        controller.todo.keepLocalConflictAndSynchronize,
      loadConflictDetails: controller.todo.loadConflictDetails,
      recoverLocalConflictCopy: controller.todo.recoverLocalConflictCopy,
      reload: controller.todo.reload,
      requestSync: controller.todo.requestSync,
      state: snapshot.builtIns.todo.state,
      useRemoteConflictAndSynchronize:
        controller.todo.useRemoteConflictAndSynchronize,
    }),
  };
}

export function createRepositoryProjection(
  controller: WorkbenchController,
  snapshot: WorkbenchControllerSnapshot,
  navigation: RepositoryNavigation,
): RepositoryApplication {
  return createRepositoryApplication({
    builtInSessions: projectBuiltInSessions(controller, snapshot),
    builtIns: {
      ...snapshot.builtIns.catalog,
      reload: controller.reloadBuiltIns,
      retry: controller.retryBuiltIn,
    },
    catalog: {
      activeDescriptor: snapshot.catalog.activeDescriptor,
      catalogLabel: snapshot.catalog.catalogLabel,
      createRepository: controller.createRepository,
      deleteRepository: controller.deleteRepository,
      reload: controller.refreshRepositories,
      renameRepository: controller.renameRepository,
      selectRepository: controller.selectRepository,
      state: snapshot.catalog.state,
    },
    navigation,
    session: projectWorkspaceRepositorySessionSummary({
      discardPendingChangesAndReload:
        controller.workspace.discardPendingChangesAndReload,
      keepLocalConflictAndSynchronize:
        controller.workspace.keepLocalConflictAndSynchronize,
      loadConflictDetails: controller.workspace.loadConflictDetails,
      recoverLocalConflictCopy:
        controller.workspace.recoverLocalConflictCopy,
      reload: controller.workspace.reload,
      state: snapshot.workspace,
      useRemoteConflictAndSynchronize:
        controller.workspace.useRemoteConflictAndSynchronize,
    }),
  });
}
