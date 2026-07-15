import type {
  RepositoryDescriptorDto,
} from "../../../contracts/workspace-repository/types";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "./workspaceRepository";

export type WorkspaceRepositoryDescriptor = RepositoryDescriptorDto;

export type CreateWorkspaceRepositoryInput = {
  content: WorkspaceRepositoryContent;
  id: string;
};

export type WorkspaceRepositoryCatalog = {
  createRepository: (
    input: CreateWorkspaceRepositoryInput,
  ) => Promise<WorkspaceRepositoryDescriptor>;
  label: string;
  listRepositories: () => Promise<WorkspaceRepositoryDescriptor[]>;
  openRepository: (
    descriptor: WorkspaceRepositoryDescriptor,
  ) => WorkspaceRepository;
};
