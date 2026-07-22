import type {
  BuiltInId,
  ContentRevision,
} from "./builtInRepository";
import type { WorkspaceRepositoryDescriptor } from "./workspaceRepositoryCatalog";
import type { WorkspacePersistenceState } from "../workspace/session/workspaceSessionSaveQueue";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RenameRepositoryRequest,
  RepositoryCatalogState,
} from "./repositoryCatalog";
import type { RepositoryNavigation } from "./repositoryNavigation";
import type { VersionedRepositoryPersistenceState } from "./versionedRepositorySaveQueue";
import type { BuiltInCatalogApplication } from "./builtInCatalogController";

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
      persistence: WorkspacePersistenceState;
      reload: () => Promise<void>;
      status: "ready";
      storageLabel: string;
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
      persistence: VersionedRepositoryPersistenceState<ContentRevision>;
      reload: () => Promise<void>;
      requestSync: () => void;
      status: "ready";
    };
