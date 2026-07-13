import type { WorkspaceRepository } from "../../../storage/workspaceRepository";
import { WorkspaceRepositoryConflictError } from "../../../storage/workspaceRepository";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceContext,
} from "../../../workspace/context/workspaceContext";
import {
  createDefaultWorkspaceSyntaxFile,
  parseWorkspaceSyntaxSource,
  type WorkspaceSyntaxSourceFile,
  type WorkspaceSyntaxFile,
  workspaceSyntaxFileName,
} from "../../../workspace/context/workspaceSyntaxFile";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../workspace/indexes/workspaceStructureIndex";
import type { WorkspaceData } from "../../../workspace/model/workspaceData";
import {
  createSessionCommands,
  type SessionCommands,
} from "./sessionCommands";
import {
  loadWorkspaceSessionSnapshot,
  type WorkspaceSessionSnapshot,
} from "./sessionRepositorySnapshot";
import {
  createWorkspaceSessionSaveQueue,
  type WorkspaceSessionSaveQueue,
  type WorkspaceSessionSaveStatus,
} from "./workspaceSessionSaveQueue";

type WorkspaceSessionAvailableStateBase = {
  context: WorkspaceContext | null;
  defaultWorkspaceSyntaxFile: WorkspaceSyntaxFile;
  errorMessage: string;
  repositoryPath: string;
  saveStatus: WorkspaceSessionSaveStatus;
  storageLabel: string;
  workspace: WorkspaceStructureIndex;
  workspaceSyntaxFile: WorkspaceSyntaxFile | null;
};

export type WorkspaceSessionReadyState =
  WorkspaceSessionAvailableStateBase & {
    status: "ready";
  };

export type WorkspaceSessionConflictState =
  WorkspaceSessionAvailableStateBase & {
    currentRevision: string;
    status: "conflict";
  };

export type WorkspaceSessionControllerState =
  | {
      status: "loading";
      storageLabel: string;
    }
  | {
      errorMessage: string;
      status: "failed";
      storageLabel: string;
    }
  | WorkspaceSessionConflictState
  | WorkspaceSessionReadyState;

type LoadedWorkspaceSession = {
  context: WorkspaceContext | null;
  generation: number;
  latestSyntaxFile: WorkspaceSyntaxFile | null;
  repositoryPath: string;
  revision: string;
  syntaxSourceFile: WorkspaceSyntaxSourceFile | null;
  workspace: WorkspaceStructureIndex;
  workspaceData: WorkspaceData;
  workspaceSyntaxFile: WorkspaceSyntaxFile | null;
};

export type WorkspaceSessionController = {
  commands: SessionCommands;
  discardPendingChangesAndReload: () => Promise<void>;
  dispose: () => void;
  flushPendingChanges: () => Promise<void>;
  getState: () => WorkspaceSessionControllerState;
  reload: () => Promise<void>;
  start: () => void;
  subscribe: (listener: () => void) => () => void;
  updateWorkspaceSyntaxSource: (source: string) => Promise<void>;
  useDefaultWorkspaceSyntaxFile: () => Promise<void>;
};

export class WorkspaceSessionUnavailableError extends Error {
  constructor() {
    super("Workspace session is not ready");
    this.name = "WorkspaceSessionUnavailableError";
  }
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

function createLoadedWorkspaceSession({
  generation,
  snapshot,
}: {
  generation: number;
  snapshot: WorkspaceSessionSnapshot;
}): LoadedWorkspaceSession {
  const workspace = createWorkspaceStructureIndex(snapshot.workspaceData);

  return {
    context: snapshot.workspaceSyntaxFile
      ? attachWorkspaceSyntaxProfile(
          workspace,
          snapshot.workspaceSyntaxFile.profile,
        )
      : null,
    generation,
    latestSyntaxFile: snapshot.workspaceSyntaxFile,
    repositoryPath: snapshot.repositoryPath,
    revision: snapshot.revision,
    syntaxSourceFile: snapshot.syntaxSourceFile,
    workspace,
    workspaceData: snapshot.workspaceData,
    workspaceSyntaxFile: snapshot.workspaceSyntaxFile,
  };
}

export function createWorkspaceSessionController({
  repository,
}: {
  repository: WorkspaceRepository;
}): WorkspaceSessionController {
  const defaultWorkspaceSyntaxFile = createDefaultWorkspaceSyntaxFile();
  const listeners = new Set<() => void>();
  let generation = 0;
  let transitionVersion = 0;
  let isStarted = false;
  let loadedSession: LoadedWorkspaceSession | null = null;
  let saveQueue: WorkspaceSessionSaveQueue | null = null;
  let state: WorkspaceSessionControllerState = {
    status: "loading",
    storageLabel: repository.label,
  };

  const publish = (nextState: WorkspaceSessionControllerState) => {
    state = nextState;
    listeners.forEach((listener) => listener());
  };
  const requireAvailableSession = () => {
    if (
      !loadedSession ||
      (state.status !== "ready" && state.status !== "conflict")
    ) {
      throw new WorkspaceSessionUnavailableError();
    }

    return loadedSession;
  };
  const createAvailableState = ({
    currentRevision,
    errorMessage,
    saveStatus,
    status,
  }: {
    currentRevision?: string;
    errorMessage: string;
    saveStatus: WorkspaceSessionSaveStatus;
    status: "conflict" | "ready";
  }): WorkspaceSessionConflictState | WorkspaceSessionReadyState => {
    if (!loadedSession) {
      throw new WorkspaceSessionUnavailableError();
    }

    const availableState = {
      context: loadedSession.context,
      defaultWorkspaceSyntaxFile,
      errorMessage,
      repositoryPath: loadedSession.repositoryPath,
      saveStatus,
      storageLabel: repository.label,
      workspace: loadedSession.workspace,
      workspaceSyntaxFile: loadedSession.workspaceSyntaxFile,
    };

    return status === "conflict"
      ? {
          ...availableState,
          currentRevision: currentRevision ?? loadedSession.revision,
          status,
        }
      : { ...availableState, status };
  };
  const publishCurrentAvailableState = ({
    currentRevision,
    errorMessage = "",
    saveStatus = "idle",
    status = "ready",
  }: {
    currentRevision?: string;
    errorMessage?: string;
    saveStatus?: WorkspaceSessionSaveStatus;
    status?: "conflict" | "ready";
  } = {}) => {
    publish(
      createAvailableState({
        currentRevision,
        errorMessage,
        saveStatus,
        status,
      }),
    );
  };
  const updateLoadedWorkspace = (workspaceData: WorkspaceData) => {
    const session = requireAvailableSession();
    const availableState = state;

    if (
      availableState.status !== "ready" &&
      availableState.status !== "conflict"
    ) {
      throw new WorkspaceSessionUnavailableError();
    }

    const workspace = createWorkspaceStructureIndex(workspaceData);

    loadedSession = {
      ...session,
      context: session.workspaceSyntaxFile
        ? attachWorkspaceSyntaxProfile(
            workspace,
            session.workspaceSyntaxFile.profile,
          )
        : null,
      workspace,
      workspaceData,
    };

    publishCurrentAvailableState({
      currentRevision:
        availableState.status === "conflict"
          ? availableState.currentRevision
          : undefined,
      errorMessage: availableState.errorMessage,
      saveStatus: availableState.saveStatus,
      status: availableState.status,
    });
  };
  const commitWorkspaceData = (workspaceData: WorkspaceData) => {
    updateLoadedWorkspace(workspaceData);

    if (!saveQueue || !loadedSession) {
      throw new WorkspaceSessionUnavailableError();
    }

    saveQueue.enqueue({
      syntaxSourceFile: loadedSession.syntaxSourceFile,
      workspace: loadedSession.workspaceData,
    });
  };
  const commands = createSessionCommands({
    commitDataSnapshot: commitWorkspaceData,
    getWorkspace: () => requireAvailableSession().workspace,
  });

  const handleSaveError = (
    error: unknown,
    expectedGeneration: number,
  ) => {
    if (
      loadedSession?.generation !== expectedGeneration ||
      (state.status !== "ready" && state.status !== "conflict")
    ) {
      return;
    }

    if (error instanceof WorkspaceRepositoryConflictError) {
      publishCurrentAvailableState({
        currentRevision: error.currentRevision,
        errorMessage: "磁盘中的仓库内容已更改，本地修改尚未保存。",
        saveStatus: "error",
        status: "conflict",
      });
      return;
    }

    publishCurrentAvailableState({
      errorMessage: getErrorMessage(error, "工作区自动保存失败。"),
      saveStatus: "error",
      status: state.status,
    });
  };
  const createSaveQueue = (expectedGeneration: number) =>
    createWorkspaceSessionSaveQueue({
      onContentSaved(content) {
        if (
          loadedSession?.generation !== expectedGeneration ||
          (state.status !== "ready" && state.status !== "conflict")
        ) {
          return;
        }

        if (
          loadedSession.latestSyntaxFile?.source ===
          content.syntaxSourceFile?.source
        ) {
          const workspaceSyntaxFile = loadedSession.latestSyntaxFile;

          loadedSession = {
            ...loadedSession,
            context: workspaceSyntaxFile
              ? attachWorkspaceSyntaxProfile(
                  loadedSession.workspace,
                  workspaceSyntaxFile.profile,
                )
              : null,
            workspaceSyntaxFile,
          };
          publishCurrentAvailableState({
            currentRevision:
              state.status === "conflict" ? state.currentRevision : undefined,
            errorMessage: state.errorMessage,
            saveStatus: state.saveStatus,
            status: state.status,
          });
        }
      },
      onError(error) {
        handleSaveError(error, expectedGeneration);
      },
      onStatusChange(saveStatus) {
        if (
          loadedSession?.generation !== expectedGeneration ||
          (state.status !== "ready" && state.status !== "conflict")
        ) {
          return;
        }

        if (saveStatus === "saved") {
          publishCurrentAvailableState({ saveStatus, status: "ready" });
          return;
        }

        publishCurrentAvailableState({
          currentRevision:
            state.status === "conflict" ? state.currentRevision : undefined,
          errorMessage: state.errorMessage,
          saveStatus,
          status: state.status,
        });
      },
      async save(content) {
        const session = loadedSession;

        if (!session || session.generation !== expectedGeneration) {
          throw new WorkspaceSessionUnavailableError();
        }

        const result = await repository.commitSnapshot({
          ...content,
          baseRevision: session.revision,
        });

        if (loadedSession?.generation === expectedGeneration) {
          loadedSession.revision = result.revision;
        }
      },
    });

  const loadForTransition = async (expectedTransitionVersion: number) => {
    const nextGeneration = generation + 1;

    generation = nextGeneration;
    saveQueue?.dispose();
    saveQueue = null;
    loadedSession = null;
    publish({ status: "loading", storageLabel: repository.label });

    try {
      const snapshot = await loadWorkspaceSessionSnapshot(repository);

      if (
        !isStarted ||
        transitionVersion !== expectedTransitionVersion ||
        generation !== nextGeneration
      ) {
        return;
      }

      loadedSession = createLoadedWorkspaceSession({
        generation: nextGeneration,
        snapshot,
      });
      saveQueue = createSaveQueue(nextGeneration);
      publishCurrentAvailableState();
    } catch (error) {
      if (
        !isStarted ||
        transitionVersion !== expectedTransitionVersion ||
        generation !== nextGeneration
      ) {
        return;
      }

      publish({
        errorMessage: getErrorMessage(error, "工作区加载失败。"),
        status: "failed",
        storageLabel: repository.label,
      });
    }
  };
  const reload = async () => {
    const expectedTransitionVersion = transitionVersion + 1;
    const previousSession = loadedSession;
    const previousQueue = saveQueue;

    transitionVersion = expectedTransitionVersion;
    publish({ status: "loading", storageLabel: repository.label });

    if (previousSession && previousQueue) {
      try {
        await previousQueue.flush();
      } catch (error) {
        if (
          isStarted &&
          transitionVersion === expectedTransitionVersion &&
          loadedSession?.generation === previousSession.generation
        ) {
          publishCurrentAvailableState();
          handleSaveError(error, previousSession.generation);
        }
        return;
      }
    }

    if (isStarted && transitionVersion === expectedTransitionVersion) {
      await loadForTransition(expectedTransitionVersion);
    }
  };
  const discardPendingChangesAndReload = async () => {
    const expectedTransitionVersion = transitionVersion + 1;
    const previousQueue = saveQueue;

    transitionVersion = expectedTransitionVersion;
    publish({ status: "loading", storageLabel: repository.label });

    if (previousQueue) {
      await previousQueue.discardPendingChanges();
    }

    if (isStarted && transitionVersion === expectedTransitionVersion) {
      await loadForTransition(expectedTransitionVersion);
    }
  };
  const updateWorkspaceSyntaxSource = async (source: string) => {
    const session = requireAvailableSession();
    const syntaxFile = parseWorkspaceSyntaxSource(
      workspaceSyntaxFileName,
      source,
    );
    const syntaxSourceFile = {
      fileName: syntaxFile.fileName,
      source: syntaxFile.source,
    };

    loadedSession = {
      ...session,
      latestSyntaxFile: syntaxFile,
      syntaxSourceFile,
    };

    if (!saveQueue) {
      throw new WorkspaceSessionUnavailableError();
    }

    await saveQueue.enqueueAndWait({
      syntaxSourceFile,
      workspace: loadedSession.workspaceData,
    });
  };

  return {
    commands,
    discardPendingChangesAndReload,
    dispose() {
      isStarted = false;
      transitionVersion += 1;
      generation += 1;
      saveQueue?.dispose();
      saveQueue = null;
      loadedSession = null;
    },
    async flushPendingChanges() {
      await saveQueue?.flush();
    },
    getState() {
      return state;
    },
    reload,
    start() {
      if (isStarted) {
        return;
      }

      isStarted = true;
      transitionVersion += 1;
      void loadForTransition(transitionVersion);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateWorkspaceSyntaxSource,
    useDefaultWorkspaceSyntaxFile() {
      return updateWorkspaceSyntaxSource(defaultWorkspaceSyntaxFile.source);
    },
  };
}
