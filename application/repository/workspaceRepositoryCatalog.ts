export type RepositoryAdapterKind = "local" | "webdav";
export type RepositoryLocation =
  | {
      hostPath: string | null;
      serverPath: string;
      type: "local";
    }
  | { type: "webdav"; url: string };
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

export type DeleteWorkspaceRepositoryInput = {
  id: string;
  mode: RepositoryDeletionMode;
};

export type WorkspaceRepositoryCatalog = {
  deleteRepository(
    input: DeleteWorkspaceRepositoryInput,
  ): Promise<RepositoryDeletionResult>;
  label: string;
  listRepositories(): Promise<WorkspaceRepositoryCatalogData>;
  renameRepository(input: {
    id: string;
    label: string;
  }): Promise<WorkspaceRepositoryDescriptor>;
};
