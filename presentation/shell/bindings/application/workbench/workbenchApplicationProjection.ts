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
  controller: WorkbenchController,
  workspace: WorkbenchWorkspaceSession,
): RepositorySessionState {
  if (workspace.status === "absent") return workspace;
  if (workspace.status === "loading") {
    return { status: "loading", storageLabel: workspace.storageLabel };
  }
  if (workspace.status === "failed") {
    return {
      errorMessage: workspace.errorMessage,
      retry: controller.workspace.reload,
      status: "failed",
      storageLabel: workspace.storageLabel,
    };
  }
  return {
    discardPendingChangesAndReload:
      controller.workspace.discardPendingChangesAndReload,
    keepLocalConflictAndSynchronize:
      controller.workspace.keepLocalConflictAndSynchronize,
    loadConflictUnitIds: controller.workspace.loadConflictUnitIds,
    recoverLocalConflictCopy: controller.workspace.recoverLocalConflictCopy,
    persistence: workspace.persistence,
    reload: controller.workspace.reload,
    status: "ready",
    storageLabel: workspace.storageLabel,
    useRemoteConflictAndSynchronize:
      controller.workspace.useRemoteConflictAndSynchronize,
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
      loadConflictUnitIds:
        controller.journal.loadConflictUnitIds,
      recoverLocalConflictCopy:
        controller.journal.recoverLocalConflictCopy,
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
      loadConflictUnitIds:
        controller.todo.loadConflictUnitIds,
      recoverLocalConflictCopy:
        controller.todo.recoverLocalConflictCopy,
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
    session: projectRepositorySession(controller, snapshot.workspace),
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
      retry: controller.workspace.reload,
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
