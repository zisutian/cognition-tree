import type {
  BuiltInId,
} from "./builtInCatalog";
import type { WorkspaceRepositoryDescriptor } from "./workspaceRepositoryCatalog";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RenameRepositoryRequest,
  RepositoryCatalogState,
} from "./repositoryCatalog";
import type { RepositoryNavigation } from "./repositoryNavigation";
import type { VersionedRepositoryPersistenceState } from "../persistence/versionedRepositorySaveQueue";
import type { BuiltInCatalogApplication } from "./builtInCatalogController";

export type RepositoryPersistenceState =
  VersionedRepositoryPersistenceState<string>;

export type RepositorySessionState =
  | { status: "absent" }
  | { status: "loading"; storageLabel: string }
  | {
      errorMessage: string;
      retry: () => Promise<void>;
      status: "failed";
      storageLabel: string;
    }
  | {
      discardPendingChangesAndReload: () => Promise<void>;
      keepLocalConflictAndSynchronize: () => Promise<void>;
      loadConflictUnitIds: () => Promise<string[]>;
      recoverLocalConflictCopy: () => Promise<void>;
      persistence: RepositoryPersistenceState;
      reload: () => Promise<void>;
      status: "ready";
      storageLabel: string;
      useRemoteConflictAndSynchronize: () => Promise<void>;
    };

export type RepositoryApplication = {
  activeDescriptor: WorkspaceRepositoryDescriptor | null;
  catalogLabel: string;
  catalogState: RepositoryCatalogState;
  createRepository: (input: CreateRepositoryRequest) => Promise<void>;
  deleteRepository: (input: DeleteRepositoryRequest) => Promise<void>;
  navigation: RepositoryNavigation;
  refreshRepositories: () => Promise<void>;
  renameRepository: (input: RenameRepositoryRequest) => Promise<void>;
  selectRepository: (repositoryId: string) => Promise<void>;
  session: RepositorySessionState;
  builtIns: {
    catalog: BuiltInCatalogApplication;
    sessions: Record<BuiltInId, BuiltInSessionSummary>;
  };
};

export type BuiltInSessionSummary =
  | { status: "unavailable" }
  | { status: "loading" }
  | { errorMessage: string; reload: () => Promise<void>; status: "failed" }
  | {
      discardPendingChangesAndReload: () => Promise<void>;
      keepLocalConflictAndSynchronize: () => Promise<void>;
      loadConflictUnitIds: () => Promise<string[]>;
      recoverLocalConflictCopy: () => Promise<void>;
      persistence: RepositoryPersistenceState;
      reload: () => Promise<void>;
      requestSync: () => void;
      status: "ready";
      useRemoteConflictAndSynchronize: () => Promise<void>;
    };

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

export function createRepositoryApplication({
  builtInSessions,
  builtIns,
  catalog,
  navigation,
  session,
}: {
  builtInSessions: RepositoryApplication["builtIns"]["sessions"];
  builtIns: BuiltInCatalogApplication;
  catalog: RepositoryCatalogProjection;
  navigation: RepositoryNavigation;
  session: RepositoryApplication["session"];
}): RepositoryApplication {
  return {
    activeDescriptor: catalog.activeDescriptor,
    builtIns: { catalog: builtIns, sessions: builtInSessions },
    catalogLabel: catalog.catalogLabel,
    catalogState: catalog.state,
    async createRepository(input) {
      await catalog.createRepository(input);
    },
    async deleteRepository(input) {
      await catalog.deleteRepository(input);
    },
    navigation,
    refreshRepositories: catalog.reload,
    async renameRepository(input) {
      await catalog.renameRepository(input);
    },
    selectRepository: catalog.selectRepository,
    session,
  };
}
