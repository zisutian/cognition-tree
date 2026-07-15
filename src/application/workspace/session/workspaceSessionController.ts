import {
  createWorkspaceRepositorySyntaxSourceFile,
  WorkspaceRepositoryConflictError,
  type WorkspaceRepository,
  type WorkspaceRepositoryContent,
} from "../../../storage/workspaceRepository";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceContext,
} from "../../../workspace/context/workspaceContext";
import {
  createDefaultWorkspaceSyntax,
  parseWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../workspace/context/workspaceSyntax";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../workspace/indexes/workspaceStructureIndex";
import type { WorkspaceData } from "../../../workspace/model/workspaceData";
import { initializeWorkspaceBlockMetadata } from "../../../workspace/context/workspaceBlockMetadata";
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
  defaultWorkspaceSyntax: WorkspaceSyntax;
  errorMessage: string;
  repositoryPath: string;
  saveStatus: WorkspaceSessionSaveStatus;
  storageLabel: string;
  workspace: WorkspaceStructureIndex;
  workspaceSyntax: WorkspaceSyntax | null;
};

export type WorkspaceSessionReadyState =
  WorkspaceSessionAvailableStateBase & {
    availability: "offline" | "online";
    status: "ready";
  };

export type WorkspaceSessionConflictState =
  WorkspaceSessionAvailableStateBase & {
    availability: "conflict";
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
  availability: "conflict" | "offline" | "online";
  context: WorkspaceContext | null;
  currentRevision: string | null;
  generation: number;
  latestWorkspaceSyntax: WorkspaceSyntax | null;
  repositoryPath: string;
  revision: string;
  syntaxSourceFile: WorkspaceRepositoryContent["syntaxSourceFile"];
  workspace: WorkspaceStructureIndex;
  workspaceData: WorkspaceData;
  workspaceSyntax: WorkspaceSyntax | null;
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
  useDefaultWorkspaceSyntax: () => Promise<void>;
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
    availability: snapshot.availability,
    context: snapshot.workspaceSyntax
      ? attachWorkspaceSyntaxProfile(
          workspace,
          snapshot.workspaceSyntax.profile,
        )
      : null,
    generation,
    currentRevision: snapshot.currentRevision,
    latestWorkspaceSyntax: snapshot.workspaceSyntax,
    repositoryPath: snapshot.repositoryPath,
    revision: snapshot.revision,
    syntaxSourceFile: snapshot.syntaxSourceFile,
    workspace,
    workspaceData: snapshot.workspaceData,
    workspaceSyntax: snapshot.workspaceSyntax,
  };
}

export function createWorkspaceSessionController({
  repository,
}: {
  repository: WorkspaceRepository;
}): WorkspaceSessionController {
  const defaultWorkspaceSyntax = createDefaultWorkspaceSyntax();
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
      defaultWorkspaceSyntax,
      errorMessage,
      repositoryPath: loadedSession.repositoryPath,
      saveStatus,
      storageLabel: repository.label,
      workspace: loadedSession.workspace,
      workspaceSyntax: loadedSession.workspaceSyntax,
    };

    return status === "conflict"
      ? {
          ...availableState,
          availability: "conflict" as const,
          currentRevision:
            currentRevision ??
            loadedSession.currentRevision ??
            loadedSession.revision,
          status,
        }
      : {
          ...availableState,
          availability:
            loadedSession.availability === "offline" ? "offline" : "online",
          status,
        };
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
      context: session.workspaceSyntax
        ? attachWorkspaceSyntaxProfile(
            workspace,
            session.workspaceSyntax.profile,
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
    getSyntaxProfile: () =>
      requireAvailableSession().workspaceSyntax?.profile ?? null,
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
      loadedSession = {
        ...loadedSession,
        availability: "conflict",
        currentRevision: error.currentRevision,
      };
      publishCurrentAvailableState({
        currentRevision: error.currentRevision,
        errorMessage: "仓库内容已在其它位置更改，本地修改尚未同步。",
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
          loadedSession.latestWorkspaceSyntax?.source ===
          content.syntaxSourceFile?.source
        ) {
          const workspaceSyntax = loadedSession.latestWorkspaceSyntax;

          loadedSession = {
            ...loadedSession,
            context: workspaceSyntax
              ? attachWorkspaceSyntaxProfile(
                  loadedSession.workspace,
                  workspaceSyntax.profile,
                )
              : null,
            workspaceSyntax,
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
          loadedSession.availability = result.availability;
          loadedSession.currentRevision = null;
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
      publishCurrentAvailableState(
        snapshot.availability === "conflict"
          ? {
              currentRevision: snapshot.currentRevision ?? undefined,
              errorMessage: "仓库内容已在其它位置更改，本地修改尚未同步。",
              saveStatus: "error",
              status: "conflict",
            }
          : { status: "ready" },
      );
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
    await repository.discardPendingCommit();

    if (isStarted && transitionVersion === expectedTransitionVersion) {
      await loadForTransition(expectedTransitionVersion);
    }
  };
  const updateWorkspaceSyntaxSource = async (source: string) => {
    const session = requireAvailableSession();
    const workspaceSyntax = parseWorkspaceSyntax(source);
    const syntaxSourceFile = createWorkspaceRepositorySyntaxSourceFile(
      workspaceSyntax.source,
    );
    const workspaceData = session.syntaxSourceFile
      ? session.workspaceData
      : initializeWorkspaceBlockMetadata(
          session.workspaceData,
          workspaceSyntax.profile,
        );

    if (workspaceData !== session.workspaceData) {
      updateLoadedWorkspace(workspaceData);
    }

    const currentSession = requireAvailableSession();

    loadedSession = {
      ...currentSession,
      latestWorkspaceSyntax: workspaceSyntax,
      syntaxSourceFile,
    };

    if (!saveQueue) {
      throw new WorkspaceSessionUnavailableError();
    }

    await saveQueue.enqueueAndWait({
      syntaxSourceFile,
      workspace: workspaceData,
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
    useDefaultWorkspaceSyntax() {
      return updateWorkspaceSyntaxSource(defaultWorkspaceSyntax.source);
    },
  };
}
