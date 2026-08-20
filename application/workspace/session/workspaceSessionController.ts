// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "../persistence/workspaceRepository";
import {
  createVersionedSessionController,
  type VersionedSessionState,
} from "../../persistence/versionedSessionController";
import type {
  VersionedRepositoryPersistenceState,
} from "../../persistence/versionedRepositorySaveQueue";
import {
  createInitialWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax";
import type { WorkspaceContext } from "../../../core/workspace/context/workspaceContext";
import type { WorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import type { WorkspaceParseIndex } from "../../../core/workspace/indexes/workspaceParseIndex";
import {
  createSessionCommands,
  type SessionCommandDependencies,
  type SessionCommands,
} from "./sessionCommands";
import {
  type WorkspaceSessionProjection,
} from "./sessionRepositorySnapshot";
import { prepareWorkspaceRepositoryContent } from "../persistence/workspaceRepositoryPreparation";
import type { ApplicationScheduler } from "../../runtime/applicationScheduler";
import {
  createWorkspaceSyntaxCatalogMutationService,
  type WorkspaceSyntaxCatalogMutation,
} from "./workspaceSyntaxCatalogMutationService";
import {
  recoverWorkspaceLocalConflictCopies,
} from "../persistence/workspaceConflictRecovery";
import {
  createWorkspaceSyntaxCatalogReadModel,
  type WorkspaceSyntaxCatalogReadModel,
} from "../projection/workspaceSyntaxCatalogReadModel";

export type WorkspacePersistenceState = VersionedRepositoryPersistenceState<
  RepositoryRevision
>;

export type WorkspaceSessionReadyState = {
  analysisIndex: WorkspaceParseIndex | null;
  context: WorkspaceContext | null;
  location: WorkspaceRepository["location"];
  persistence: WorkspacePersistenceState;
  remoteRevision: RepositoryRevision | null;
  status: "ready";
  storageLabel: string;
  syntaxCatalog: WorkspaceSyntaxCatalogReadModel;
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
  synchronizePendingChanges: () => Promise<void>;
  getState: () => WorkspaceSessionControllerState;
  keepLocalConflictAndSynchronize: () => Promise<void>;
  loadConflictUnitIds: () => Promise<string[]>;
  recoverLocalConflictCopy: () => Promise<void>;
  reload: () => Promise<void>;
  prepareForRepositoryRemoval: () => Promise<{ resume: () => void }>;
  start: () => void;
  subscribe: (listener: () => void) => () => void;
  updateSyntaxFileSource: (fileId: string, source: string) => Promise<void>;
  useRemoteConflictAndSynchronize: () => Promise<void>;
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

  const newSyntaxFileTemplate = createInitialWorkspaceSyntax();
  const syntaxMutations = createWorkspaceSyntaxCatalogMutationService({
    createBlockId: commandDependencies.createBlockId,
    createSyntaxFileId: commandDependencies.createSyntaxFileId,
    newFileTemplate: newSyntaxFileTemplate,
    now: commandDependencies.now,
  });
  const base = createVersionedSessionController({
    label: "Workspace",
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
          location: state.location,
          persistence: state.persistence,
          remoteRevision: state.snapshot.remoteRevision,
          status: "ready",
          storageLabel: state.storageLabel,
          syntaxCatalog: createWorkspaceSyntaxCatalogReadModel(
            state.content.syntax,
            state.projection.syntaxById,
          ),
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
    return cachedState!;
  };
  const commands = createSessionCommands({
    commitDataSnapshot(workspace, analysisOverrides) {
      base.mutate(({ content, projection }) => {
        const nextContent = { ...content, workspace };
        const nextProjection = prepareWorkspaceRepositoryContent(nextContent, {
          analysisOverrides,
          previous: projection,
        });
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
    base.mutate(({ projection }) => {
      const nextProjection = prepareWorkspaceRepositoryContent(
        mutation.content,
        {
          analysisOverrides: mutation.analysisOverrides,
          previous: projection,
        },
      );
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
    synchronizePendingChanges: base.synchronizePendingChanges,
    getState: projectState,
    keepLocalConflictAndSynchronize: base.keepLocalConflictAndSynchronize,
    loadConflictUnitIds: base.loadConflictUnitIds,
    recoverLocalConflictCopy() {
      return base.resolveConflictAndSynchronize(
        "remote",
        (prepared, conflict, sources) =>
          recoverWorkspaceLocalConflictCopies(prepared, conflict, {
            createBlockId: commandDependencies.createBlockId,
            createWorkspaceNoteId: commandDependencies.createNoteId,
            now: commandDependencies.now,
          }, sources.local),
      );
    },
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
    useRemoteConflictAndSynchronize:
      base.useRemoteConflictAndSynchronize,
  };
}
