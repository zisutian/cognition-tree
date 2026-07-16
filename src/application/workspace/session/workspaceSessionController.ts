import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "../../../storage/repository/workspaceRepository";
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
import { validateWorkspaceBlockMetadata } from "../../../workspace/context/workspaceBlockMetadata";
import { reconcileWorkspaceSyntaxBlockMetadata } from "../../../workspace/context/workspaceSyntaxMetadata";
import {
  createSessionCommands,
  type SessionCommandDependencies,
  type SessionCommands,
} from "./sessionCommands";
import {
  loadWorkspaceSessionSnapshot,
  type WorkspaceSessionSnapshot,
} from "./sessionRepositorySnapshot";
import {
  createWorkspaceSessionSaveQueue,
  type WorkspacePersistenceState,
  type WorkspaceSessionSaveQueue,
} from "./workspaceSessionSaveQueue";

export type WorkspaceSessionReadyState = {
  context: WorkspaceContext | null;
  defaultWorkspaceSyntax: WorkspaceSyntax;
  locationLabel: string;
  persistence: WorkspacePersistenceState;
  status: "ready";
  storageLabel: string;
  workspace: WorkspaceStructureIndex;
  workspaceSyntax: WorkspaceSyntax | null;
};

export type WorkspaceSessionControllerState =
  | { status: "loading"; storageLabel: string }
  | {
      errorMessage: string;
      status: "failed";
      storageLabel: string;
    }
  | WorkspaceSessionReadyState;

type LoadedWorkspaceSession = {
  content: WorkspaceRepositoryContent;
  context: WorkspaceContext | null;
  generation: number;
  localRevision: LocalDraftRevision;
  pendingChanges: boolean;
  remoteRevision: RepositoryRevision | null;
  workspace: WorkspaceStructureIndex;
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
  const workspace = createWorkspaceStructureIndex(snapshot.content.workspace);

  return {
    content: snapshot.content,
    context: snapshot.workspaceSyntax
      ? attachWorkspaceSyntaxProfile(workspace, snapshot.workspaceSyntax.profile)
      : null,
    generation,
    localRevision: snapshot.localRevision,
    pendingChanges: snapshot.pendingChanges,
    remoteRevision: snapshot.remoteRevision,
    workspace,
    workspaceSyntax: snapshot.workspaceSyntax,
  };
}

function toRepositorySnapshot(
  session: LoadedWorkspaceSession,
): WorkspaceRepositorySnapshot {
  return {
    content: session.content,
    localRevision: session.localRevision,
    pendingChanges: session.pendingChanges,
    remoteRevision: session.remoteRevision,
  };
}

export function createWorkspaceSessionController({
  commandDependencies,
  repository,
}: {
  commandDependencies: SessionCommandDependencies;
  repository: WorkspaceRepository;
}): WorkspaceSessionController {
  const defaultWorkspaceSyntax = createDefaultWorkspaceSyntax();
  const listeners = new Set<() => void>();
  let disposed = false;
  let generation = 0;
  let loadedSession: LoadedWorkspaceSession | null = null;
  let saveQueue: WorkspaceSessionSaveQueue | null = null;
  let transitionVersion = 0;
  let state: WorkspaceSessionControllerState = {
    status: "loading",
    storageLabel: repository.label,
  };

  const publish = (nextState: WorkspaceSessionControllerState) => {
    if (disposed) {
      return;
    }

    state = nextState;
    listeners.forEach((listener) => listener());
  };
  const requireReadySession = () => {
    if (!loadedSession || state.status !== "ready") {
      throw new WorkspaceSessionUnavailableError();
    }

    return loadedSession;
  };
  const publishReady = (persistence: WorkspacePersistenceState) => {
    const session = loadedSession;

    if (!session) {
      throw new WorkspaceSessionUnavailableError();
    }

    publish({
      context: session.context,
      defaultWorkspaceSyntax,
      locationLabel: repository.locationLabel,
      persistence,
      status: "ready",
      storageLabel: repository.label,
      workspace: session.workspace,
      workspaceSyntax: session.workspaceSyntax,
    });
  };
  const getCurrentPersistence = (): WorkspacePersistenceState =>
    state.status === "ready" ? state.persistence : { status: "saved" };
  const updateLoadedContent = (
    content: WorkspaceRepositoryContent,
    workspaceSyntax: WorkspaceSyntax | null,
  ) => {
    const session = requireReadySession();
    const workspace = createWorkspaceStructureIndex(content.workspace);

    loadedSession = {
      ...session,
      content,
      context: workspaceSyntax
        ? attachWorkspaceSyntaxProfile(workspace, workspaceSyntax.profile)
        : null,
      pendingChanges: true,
      workspace,
      workspaceSyntax,
    };
    publishReady(getCurrentPersistence());
  };
  const enqueueCurrentContent = () => {
    if (!loadedSession || !saveQueue) {
      throw new WorkspaceSessionUnavailableError();
    }

    saveQueue.enqueue(loadedSession.content);
  };
  const commitWorkspaceData = (workspaceData: WorkspaceData) => {
    const session = requireReadySession();
    const content = { ...session.content, workspace: workspaceData };

    updateLoadedContent(content, session.workspaceSyntax);
    enqueueCurrentContent();
  };
  const commands = createSessionCommands({
    commitDataSnapshot: commitWorkspaceData,
    dependencies: commandDependencies,
    getSyntaxProfile: () => requireReadySession().workspaceSyntax?.profile ?? null,
    getWorkspace: () => requireReadySession().workspace,
  });

  const installSaveQueue = (
    expectedGeneration: number,
    initialPersistenceState?: WorkspacePersistenceState,
  ) => {
    const session = loadedSession;

    if (!session || session.generation !== expectedGeneration) {
      throw new WorkspaceSessionUnavailableError();
    }

    saveQueue?.dispose();
    saveQueue = createWorkspaceSessionSaveQueue({
      initialPersistenceState,
      initialSnapshot: toRepositorySnapshot(session),
      onLocalStaged(content, localRevision) {
        if (loadedSession?.generation !== expectedGeneration) {
          return;
        }

        loadedSession = {
          ...loadedSession,
          // A newer command can publish another in-memory snapshot while this
          // local transaction is in flight. Its revision must advance the CAS
          // base, but the older staged content must never replace that newer
          // desired snapshot (notably a newer syntax profile).
          content: loadedSession.content === content
            ? content
            : loadedSession.content,
          localRevision,
          pendingChanges: true,
        };
      },
      onPersistenceChange(persistence) {
        if (loadedSession?.generation !== expectedGeneration) {
          return;
        }

        loadedSession = {
          ...loadedSession,
          pendingChanges:
            persistence.status === "saved"
              ? false
              : persistence.status === "offline"
                ? persistence.pendingChanges
                : loadedSession.pendingChanges,
        };
        publishReady(persistence);
      },
      onRemoteRevision(remoteRevision) {
        if (loadedSession?.generation === expectedGeneration) {
          loadedSession = { ...loadedSession, remoteRevision };
        }
      },
      repository,
    });
  };

  const installSnapshot = (
    snapshot: WorkspaceSessionSnapshot,
    initialPersistenceState?: WorkspacePersistenceState,
  ) => {
    generation += 1;
    loadedSession = createLoadedWorkspaceSession({ generation, snapshot });
    installSaveQueue(generation, initialPersistenceState);
  };

  const loadForTransition = async ({
    preserveReadyState,
  }: {
    preserveReadyState: boolean;
  }) => {
    const expectedTransition = ++transitionVersion;
    const previousState = state;
    let localFlushFailed = false;

    if (!preserveReadyState) {
      publish({ status: "loading", storageLabel: repository.label });
    }

    try {
      let snapshot = await loadWorkspaceSessionSnapshot(repository);

      if (preserveReadyState) {
        // The ready session remains editable while reload is reading
        // IndexedDB. Stabilize on a snapshot whose local CAS revision matches
        // every edit staged during that read; otherwise installing the stale
        // snapshot would detach the next command from the durable revision.
        while (!disposed && expectedTransition === transitionVersion) {
          try {
            await saveQueue?.flushLocal();
          } catch (error) {
            localFlushFailed = true;
            throw error;
          }

          if (!saveQueue || snapshot.localRevision === saveQueue.getLocalRevision()) {
            break;
          }
          snapshot = await loadWorkspaceSessionSnapshot(repository);
        }
      }

      if (disposed || expectedTransition !== transitionVersion) {
        return;
      }

      installSnapshot(snapshot);
    } catch (error) {
      if (disposed || expectedTransition !== transitionVersion) {
        return;
      }

      if (preserveReadyState && previousState.status === "ready") {
        // Loading never hid the ready session. Keep its latest in-memory
        // content and persistence state, including edits made during reload.
        if (localFlushFailed) {
          throw error;
        }
        return;
      }

      loadedSession = null;
      saveQueue?.dispose();
      saveQueue = null;
      publish({
        errorMessage: getErrorMessage(error, "工作区加载失败。"),
        status: "failed",
        storageLabel: repository.label,
      });
    }
  };

  const updateWorkspaceSyntaxSource = (source: string) => {
    const workspaceSyntax = parseWorkspaceSyntax(source);
    const session = requireReadySession();
    const workspaceData = reconcileWorkspaceSyntaxBlockMetadata(
      session.content.workspace,
      session.workspaceSyntax?.profile ?? null,
      workspaceSyntax.profile,
      {
        createBlockId: commandDependencies.createBlockId,
        timestamp: commandDependencies.now(),
      },
    );

    updateLoadedContent(
      {
        ...session.content,
        syntaxSource: source,
        workspace: workspaceData,
      },
      workspaceSyntax,
    );
    enqueueCurrentContent();
    return saveQueue!.flushLocal();
  };

  return {
    commands,
    async discardPendingChangesAndReload() {
      requireReadySession();
      const previousState = state;
      let discardPrepared = false;

      try {
        await saveQueue?.prepareForDiscard();
        discardPrepared = true;
        const snapshot = await repository.discardPendingSnapshotAndReload();
        const workspaceSyntax = snapshot.content.syntaxSource === null
          ? null
          : parseWorkspaceSyntax(snapshot.content.syntaxSource);

        validateWorkspaceBlockMetadata(
          snapshot.content.workspace,
          workspaceSyntax?.profile ?? null,
        );

        installSnapshot({ ...snapshot, workspaceSyntax });
      } catch (error) {
        const currentSession = loadedSession;

        if (currentSession && previousState.status === "ready") {
          const persistence = state.status === "ready"
            ? state.persistence
            : previousState.persistence;

          // `prepareForDiscard` may have staged a newer desired snapshot before
          // the remote read failed. Keep that latest local revision/content and
          // only replace the disposed queue; rebuilding from the pre-flush
          // snapshot would reintroduce a stale local CAS revision.
          if (discardPrepared) {
            installSaveQueue(currentSession.generation, persistence);
          }
          publishReady(persistence);
        }

        throw error;
      }
    },
    dispose() {
      disposed = true;
      transitionVersion += 1;
      saveQueue?.dispose();
      listeners.clear();
    },
    async flushPendingChanges() {
      requireReadySession();
      await saveQueue?.flushLocal();
    },
    getState() {
      return state;
    },
    async reload() {
      const preserveReadyState = state.status === "ready";

      // A command publishes its in-memory result before the asynchronous local
      // stage completes. Loading a replacement snapshot during that window
      // would install the older local revision, then ignore the old queue's
      // eventual completion because its generation is stale. Flush first so
      // reload observes both the latest content and its matching local CAS
      // revision.
      if (preserveReadyState) {
        await saveQueue?.flushLocal();
      }

      await loadForTransition({ preserveReadyState });
    },
    start() {
      if (!disposed && !loadedSession) {
        void loadForTransition({ preserveReadyState: false });
      }
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
