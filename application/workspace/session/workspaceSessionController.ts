// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "../../repository/workspaceRepository";
import {
  createVersionedSessionController,
  type VersionedSessionState,
} from "../../persistence/versionedSessionController";
import type {
  VersionedRepositoryPersistenceState,
} from "../../persistence/versionedRepositorySaveQueue";
import {
  createDefaultWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax";
import type { WorkspaceContext } from "../../../core/workspace/context/workspaceContext";
import type { WorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import type { WorkspaceParseIndex } from "../../../core/workspace/indexes/workspaceParseIndex";
import type { WorkspaceSyntaxCatalog } from "../../../core/workspace/model/workspaceSyntaxCatalog";
import {
  createSessionCommands,
  type SessionCommandDependencies,
  type SessionCommands,
} from "./sessionCommands";
import {
  resolveWorkspaceSessionContent,
  type WorkspaceSessionProjection,
} from "./sessionRepositorySnapshot";
import type { ApplicationScheduler } from "../../runtime/applicationScheduler";
import {
  createWorkspaceSyntaxCatalogMutationService,
  type WorkspaceSyntaxCatalogMutation,
} from "./workspaceSyntaxCatalogMutationService";

export type WorkspacePersistenceState = VersionedRepositoryPersistenceState<
  RepositoryRevision
>;

export type WorkspaceSessionReadyState = {
  analysisIndex: WorkspaceParseIndex | null;
  context: WorkspaceContext | null;
  defaultWorkspaceSyntax: WorkspaceSyntax;
  location: WorkspaceRepository["location"];
  persistence: WorkspacePersistenceState;
  status: "ready";
  storageLabel: string;
  syntaxCatalog: WorkspaceSyntaxCatalog;
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

export type WorkspaceSessionController = {
  activateSyntaxFile: (fileId: string) => Promise<void>;
  commands: SessionCommands;
  createSyntaxFile: (templateFileId: string | null) => Promise<string>;
  deleteSyntaxFile: (fileId: string) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  dispose: () => void;
  flushPendingChanges: () => Promise<void>;
  getState: () => WorkspaceSessionControllerState;
  reload: () => Promise<void>;
  prepareForRepositoryRemoval: () => Promise<{ resume: () => void }>;
  start: () => void;
  subscribe: (listener: () => void) => () => void;
  updateSyntaxFileSource: (fileId: string, source: string) => Promise<void>;
};

export class WorkspaceSessionUnavailableError extends Error {
  constructor() {
    super("Workspace session is not ready");
    this.name = "WorkspaceSessionUnavailableError";
  }
}

export function createWorkspaceSessionController({
  commandDependencies,
  repository,
  scheduler,
}: {
  commandDependencies: SessionCommandDependencies;
  repository: WorkspaceRepository;
  scheduler: Pick<ApplicationScheduler, "schedule">;
}): WorkspaceSessionController {
  type BaseState = VersionedSessionState<
    WorkspaceRepositoryContent,
    WorkspaceSessionProjection,
    RepositoryRevision,
    LocalDraftRevision,
    WorkspaceRepository["location"]
  >;

  const defaultWorkspaceSyntax = createDefaultWorkspaceSyntax();
  const syntaxMutations = createWorkspaceSyntaxCatalogMutationService({
    createBlockId: commandDependencies.createBlockId,
    createSyntaxFileId: commandDependencies.createSyntaxFileId,
    defaultWorkspaceSyntax,
    now: commandDependencies.now,
  });
  let previousAnalysisIndex: WorkspaceParseIndex | null = null;
  const base = createVersionedSessionController({
    label: "Workspace",
    parseContent: (value) => value as WorkspaceRepositoryContent,
    prepareContent(content) {
      const projection = resolveWorkspaceSessionContent(
        content,
        previousAnalysisIndex,
      );

      previousAnalysisIndex = projection.analysisIndex;
      return projection;
    },
    repository,
    scheduler,
  });
  let cachedBaseState: BaseState | null = null;
  let cachedState: WorkspaceSessionControllerState | null = null;

  const requireReady = () => {
    const state = base.getState();

    if (state.status !== "ready" || !base.canMutate()) {
      throw new WorkspaceSessionUnavailableError();
    }
    return state;
  };
  const projectState = (): WorkspaceSessionControllerState => {
    const state = base.getState();

    if (state === cachedBaseState && cachedState) {
      return cachedState;
    }
    cachedBaseState = state;
    switch (state.status) {
      case "ready":
        cachedState = {
          analysisIndex: state.projection.analysisIndex,
          context: state.projection.context,
          defaultWorkspaceSyntax,
          location: state.location,
          persistence: state.persistence,
          status: "ready",
          storageLabel: state.storageLabel,
          syntaxCatalog: state.content.syntax,
          workspace: state.projection.workspace,
          workspaceSyntax: state.projection.workspaceSyntax,
        };
        break;
      case "failed":
        cachedState = state;
        break;
      case "loading":
        cachedState = state;
        break;
      case "unavailable":
        throw new WorkspaceSessionUnavailableError();
    }
    return cachedState;
  };
  const commands = createSessionCommands({
    commitDataSnapshot(workspace, analysisOverrides) {
      base.mutatePrepared(({ content, projection }) => {
        const nextContent = { ...content, workspace };
        const nextProjection = resolveWorkspaceSessionContent(
          nextContent,
          projection.analysisIndex,
          analysisOverrides,
        );

        previousAnalysisIndex = nextProjection.analysisIndex;
        return { content: nextContent, projection: nextProjection };
      });
    },
    dependencies: commandDependencies,
    getSyntax: () =>
      requireReady().projection.workspaceSyntax?.syntax ?? null,
    getAnalysisIndex: () => requireReady().projection.analysisIndex,
    getWorkspace: () => requireReady().projection.workspace,
  });
  const commitSyntaxMutation = (
    mutation: WorkspaceSyntaxCatalogMutation,
  ) => {
    base.mutatePrepared(({ projection }) => {
      const nextProjection = resolveWorkspaceSessionContent(
        mutation.content,
        projection.analysisIndex,
        mutation.analysisOverrides,
      );

      previousAnalysisIndex = nextProjection.analysisIndex;
      return {
        content: mutation.content,
        projection: nextProjection,
      };
    });
    return base.flushPendingChanges();
  };

  return {
    activateSyntaxFile(fileId) {
      const current = requireReady();
      const mutation = syntaxMutations.activateFile(
        current.content,
        current.projection.analysisIndex,
        fileId,
      );

      return mutation ? commitSyntaxMutation(mutation) : Promise.resolve();
    },
    commands,
    createSyntaxFile(templateFileId) {
      const current = requireReady();
      const mutation = syntaxMutations.createFile(
        current.content,
        current.projection.analysisIndex,
        templateFileId,
      );

      return commitSyntaxMutation(mutation).then(() => mutation.fileId);
    },
    deleteSyntaxFile(fileId) {
      const current = requireReady();
      return commitSyntaxMutation(
        syntaxMutations.deleteFile(
          current.content,
          current.projection.analysisIndex,
          fileId,
        ),
      );
    },
    discardPendingChangesAndReload: base.discardPendingChangesAndReload,
    dispose: base.dispose,
    flushPendingChanges: base.flushPendingChanges,
    getState: projectState,
    prepareForRepositoryRemoval: base.prepareForRemoval,
    reload: base.reload,
    start: base.start,
    subscribe: base.subscribe,
    updateSyntaxFileSource(fileId, source) {
      const current = requireReady();
      return commitSyntaxMutation(
        syntaxMutations.updateFileSource(
          current.content,
          current.projection.analysisIndex,
          fileId,
          source,
        ),
      );
    },
  };
}
