export type RepositoryLocation = {
  hostPath: string | null;
  serverPath: string;
};
export type RepositoryApiErrorCode =
  | "invalid_request"
  | "repository_not_found"
  | "unsupported_repository_version"
  | "revision_conflict"
  | "repository_busy"
  | "repository_corrupt"
  | "adapter_unavailable"
  | "insufficient_storage"
  | "unauthorized"
  | "internal_error";
export type WorkspaceRepositoryDescriptor = {
  id: string;
  label: string;
  labelIssue: "conflict" | "nonportable" | "reserved" | null;
  location: RepositoryLocation;
};
export type WorkspaceRepositoryCatalogIssue = {
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
};
export type WorkspaceRepositoryCatalogData = {
  issues: WorkspaceRepositoryCatalogIssue[];
  repositories: WorkspaceRepositoryDescriptor[];
};

export type DeleteWorkspaceRepositoryInput = {
  id: string;
};

export type WorkspaceRepositoryCatalog = {
  deleteRepository(
    input: DeleteWorkspaceRepositoryInput,
  ): Promise<void>;
  label: string;
  listRepositories(): Promise<WorkspaceRepositoryCatalogData>;
  renameRepository(input: {
    id: string;
    label: string;
  }): Promise<WorkspaceRepositoryDescriptor>;
};
