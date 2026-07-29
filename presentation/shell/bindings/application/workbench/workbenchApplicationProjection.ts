import type {
  RepositoryNavigation,
} from "../../../../../application/repository/repositoryNavigation";
import {
  createRepositoryApplication,
  projectBuiltInSessionSummary,
  type BuiltInSessionSummary,
  type RepositoryApplication,
  type RepositorySessionState,
} from "../../../../../application/repository/repositoryApplication";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
  WorkbenchWorkspaceSession,
} from "../../../../../application/workbench/workbenchController";
import type { WorkbenchApplication } from "../../../../activities/workbenchApplication";

function projectRepositorySession(
  workspace: WorkbenchWorkspaceSession,
): RepositorySessionState {
  if (workspace.status === "absent") return workspace;
  if (workspace.status === "loading") {
    return { status: "loading", storageLabel: workspace.storageLabel };
  }
  if (workspace.status === "failed") {
    return {
      errorMessage: workspace.errorMessage,
      retry: workspace.controller.reload,
      status: "failed",
      storageLabel: workspace.storageLabel,
    };
  }
  return {
    discardPendingChangesAndReload:
      workspace.controller.discardPendingChangesAndReload,
    keepLocalConflictAndSynchronize:
      workspace.controller.keepLocalConflictAndSynchronize,
    loadConflictUnitIds: workspace.controller.loadConflictUnitIds,
    recoverLocalConflictCopy: workspace.controller.recoverLocalConflictCopy,
    persistence: workspace.persistence,
    reload: workspace.controller.reload,
    status: "ready",
    storageLabel: workspace.storageLabel,
    useRemoteConflictAndSynchronize:
      workspace.controller.useRemoteConflictAndSynchronize,
  };
}

function projectBuiltInSessions(
  snapshot: WorkbenchControllerSnapshot,
): Record<"journal" | "todo", BuiltInSessionSummary> {
  return {
    journal: projectBuiltInSessionSummary({
      discardPendingChangesAndReload:
        snapshot.builtIns.journal.controller.discardPendingChangesAndReload,
      keepLocalConflictAndSynchronize:
        snapshot.builtIns.journal.controller.keepLocalConflictAndSynchronize,
      loadConflictUnitIds:
        snapshot.builtIns.journal.controller.loadConflictUnitIds,
      recoverLocalConflictCopy:
        snapshot.builtIns.journal.controller.recoverLocalConflictCopy,
      reload: snapshot.builtIns.journal.controller.reload,
      requestSync: snapshot.builtIns.journal.controller.requestSync,
      state: snapshot.builtIns.journal.state,
      useRemoteConflictAndSynchronize:
        snapshot.builtIns.journal.controller
          .useRemoteConflictAndSynchronize,
    }),
    todo: projectBuiltInSessionSummary({
      discardPendingChangesAndReload:
        snapshot.builtIns.todo.controller.discardPendingChangesAndReload,
      keepLocalConflictAndSynchronize:
        snapshot.builtIns.todo.controller.keepLocalConflictAndSynchronize,
      loadConflictUnitIds:
        snapshot.builtIns.todo.controller.loadConflictUnitIds,
      recoverLocalConflictCopy:
        snapshot.builtIns.todo.controller.recoverLocalConflictCopy,
      reload: snapshot.builtIns.todo.controller.reload,
      requestSync: snapshot.builtIns.todo.controller.requestSync,
      state: snapshot.builtIns.todo.state,
      useRemoteConflictAndSynchronize:
        snapshot.builtIns.todo.controller.useRemoteConflictAndSynchronize,
    }),
  };
}

export function createRepositoryProjection(
  controller: WorkbenchController,
  snapshot: WorkbenchControllerSnapshot,
  navigation: RepositoryNavigation,
): RepositoryApplication {
  return createRepositoryApplication({
    builtInSessions: projectBuiltInSessions(snapshot),
    builtIns: snapshot.builtIns.catalog,
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
    session: projectRepositorySession(snapshot.workspace),
  });
}

export function projectUnavailableWorkspace(
  controller: WorkbenchController,
  snapshot: WorkbenchControllerSnapshot,
): WorkbenchApplication["workspace"] {
  if (snapshot.workspace.status === "loading") {
    return {
      status: "loading",
      storageLabel: snapshot.workspace.storageLabel,
    };
  }
  if (snapshot.workspace.status === "failed") {
    return {
      errorMessage: snapshot.workspace.errorMessage,
      retry: snapshot.workspace.controller.reload,
      status: "failed",
      storageLabel: snapshot.workspace.storageLabel,
    };
  }
  if (snapshot.catalog.state.status === "loading") {
    return {
      status: "loading",
      storageLabel: snapshot.catalog.catalogLabel,
    };
  }
  if (snapshot.catalog.state.status === "failed") {
    return {
      errorMessage: snapshot.catalog.state.errorMessage,
      retry: controller.refreshRepositories,
      status: "failed",
      storageLabel: snapshot.catalog.catalogLabel,
    };
  }
  return { status: "absent" };
}
