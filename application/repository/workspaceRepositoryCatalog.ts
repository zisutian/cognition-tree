import type {
  RepositoryApiErrorCode,
  RepositoryLocation,
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "./workspaceRepository";

export type RepositoryAdapterKind = "browser" | "local" | "webdav";
export type RepositoryAuthentication =
  | { type: "none" }
  | { password: string; type: "basic"; username: string };
export type WorkspaceRepositoryDescriptor = {
  adapter: RepositoryAdapterKind;
  id: string;
  label: string;
  labelIssue: "conflict" | "nonportable" | "reserved" | null;
  location: RepositoryLocation;
};
export type WorkspaceRepositoryCatalogIssue = {
  adapter: RepositoryAdapterKind;
  code: Extract<
    RepositoryApiErrorCode,
    | "adapter_unavailable"
    | "repository_busy"
    | "repository_corrupt"
    | "unsupported_repository_version"
  >;
  id: string;
  location: RepositoryLocation | null;
  message: string;
  status: "deleting" | "fault";
};
export type RepositoryDeletionMode =
  | "delete-managed-data"
  | "remove-connection";
export type RepositoryDeletionResult = { status: "deleted" | "deleting" };
export type WorkspaceRepositoryCatalogData = {
  creatableAdapters: RepositoryAdapterKind[];
  issues: WorkspaceRepositoryCatalogIssue[];
  repositories: WorkspaceRepositoryDescriptor[];
};

export type CreateWorkspaceRepositoryInput =
  | {
      adapter: "local";
      content: WorkspaceRepositoryContent;
      label: string;
    }
  | {
      adapter: "webdav";
      authentication: RepositoryAuthentication;
      initialContent: WorkspaceRepositoryContent;
      label: string;
      url: string;
    }
  | {
      adapter: "browser";
      content: WorkspaceRepositoryContent;
      label: string;
    };

export type DeleteWorkspaceRepositoryInput = {
  id: string;
  mode: RepositoryDeletionMode;
};

export type WorkspaceRepositoryCatalog = {
  createRepository(
    input: CreateWorkspaceRepositoryInput,
  ): Promise<WorkspaceRepositoryDescriptor>;
  deleteRepository(
    input: DeleteWorkspaceRepositoryInput,
  ): Promise<RepositoryDeletionResult>;
  label: string;
  listRepositories(): Promise<WorkspaceRepositoryCatalogData>;
  openRepository(
    descriptor: WorkspaceRepositoryDescriptor,
  ): WorkspaceRepository;
  renameRepository(input: {
    id: string;
    label: string;
  }): Promise<WorkspaceRepositoryDescriptor>;
};
