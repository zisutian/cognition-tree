import type {
  SystemRepository,
  SystemRepositoryPurpose,
} from "../../storage/repository/systemRepository";
import type { WorkspaceRepositoryDescriptor } from "../../storage/repository/workspaceRepositoryCatalog";
import type { WorkspacePersistenceState } from "../workspace/session/workspaceSessionSaveQueue";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RenameRepositoryRequest,
  RepositoryCatalogState,
} from "../workspace/session/useRepositoryCatalog";
import type { RepositoryNavigation } from "./useRepositoryNavigation";
import type { SystemRepositoryCatalogApplication } from "./useSystemRepositoryCatalog";
import type { SystemRepositorySession } from "./useSystemRepositorySession";

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
  systems: {
    catalog: SystemRepositoryCatalogApplication;
    repositories: Partial<Record<SystemRepositoryPurpose, SystemRepository>>;
    sessions: Record<SystemRepositoryPurpose, SystemRepositorySession>;
  };
};
