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
  revision: `sha256:${string}` | null;
  issues: WorkspaceRepositoryCatalogIssue[];
  repositories: WorkspaceRepositoryDescriptor[];
};

export type RepositoryMutationBasis = {
  baseRevision: `sha256:${string}`;
  operationId: string;
};
export type RepositoryMutationResult = {
  revision: `sha256:${string}`;
  descriptor: WorkspaceRepositoryDescriptor;
};
export type DeleteWorkspaceRepositoryInput = RepositoryMutationBasis & {
  id: string;
  repository: string;
};
export type WorkspaceRepositoryCatalog = {
  label: string;
  listRepositories(): Promise<WorkspaceRepositoryCatalogData>;
  createRepository(
    input: RepositoryMutationBasis & { label: string },
  ): Promise<RepositoryMutationResult>;
  deleteRepository(
    input: DeleteWorkspaceRepositoryInput,
  ): Promise<{ revision: `sha256:${string}` }>;
  renameRepository(
    input: RepositoryMutationBasis & {
      id: string;
      repository: string;
      label: string;
    },
  ): Promise<RepositoryMutationResult>;
};
