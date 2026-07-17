import type {
  CreateRepositoryDto,
  RepositoryAdapterKindDto,
  RepositoryAuthenticationDto,
  RepositoryCatalogDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
  RepositoryDeletionModeDto,
  RepositoryDeletionResultDto,
} from "../../../contracts/workspace-repository/types";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "./workspaceRepository";

export type WorkspaceRepositoryDescriptor = RepositoryDescriptorDto;
export type WorkspaceRepositoryCatalogIssue = RepositoryCatalogIssueDto;
export type RepositoryAdapterKind = RepositoryAdapterKindDto;
export type RepositoryAuthentication = RepositoryAuthenticationDto;
export type RepositoryDeletionMode = RepositoryDeletionModeDto;
export type RepositoryDeletionResult = RepositoryDeletionResultDto;
export type WorkspaceRepositoryCatalogData = RepositoryCatalogDto;

export type CreateWorkspaceRepositoryInput =
  | CreateRepositoryDto
  | {
      adapter: "browser";
      content: WorkspaceRepositoryContent;
      label: string;
    };

export type DeleteWorkspaceRepositoryInput = {
  id: string;
  mode: RepositoryDeletionModeDto;
};

export type WorkspaceRepositoryCatalog = {
  createRepository(
    input: CreateWorkspaceRepositoryInput,
  ): Promise<WorkspaceRepositoryDescriptor>;
  deleteRepository(
    input: DeleteWorkspaceRepositoryInput,
  ): Promise<RepositoryDeletionResultDto>;
  label: string;
  listRepositories(): Promise<RepositoryCatalogDto>;
  openRepository(
    descriptor: WorkspaceRepositoryDescriptor,
  ): WorkspaceRepository;
};
