import type {
  RepositoryCatalogDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
} from "../../../contracts/workspace-repository/types";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "./workspaceRepository";

export type WorkspaceRepositoryDescriptor = RepositoryDescriptorDto;
export type WorkspaceRepositoryCatalogIssue = RepositoryCatalogIssueDto;

export type CreateWorkspaceRepositoryInput = {
  content: WorkspaceRepositoryContent;
  id: string;
  label: string;
};

export type WorkspaceRepositoryCatalog = {
  createRepository(
    input: CreateWorkspaceRepositoryInput,
  ): Promise<WorkspaceRepositoryDescriptor>;
  label: string;
  listRepositories(): Promise<RepositoryCatalogDto>;
  openRepository(
    descriptor: WorkspaceRepositoryDescriptor,
  ): WorkspaceRepository;
};
