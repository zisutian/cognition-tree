// SPDX-License-Identifier: GPL-3.0-or-later

export const repositorySyntaxFileName = "workspace.toml";

export type RepositoryNoteDto = {
  createdAt: string;
  id: string;
  source: string;
  title: string;
  updatedAt: string;
};

export type RepositoryTreeNodeDto =
  | {
      children: RepositoryTreeNodeDto[];
      id: string;
      kind: "folder";
      title: string;
    }
  | {
      id: string;
      kind: "note";
      noteId: string;
    };

export type RepositoryWorkspaceDto = {
  id: string;
  name: string;
  notes: RepositoryNoteDto[];
  tree: RepositoryTreeNodeDto[];
};

export type RepositorySyntaxSourceDto = {
  fileName: typeof repositorySyntaxFileName;
  source: string;
};

export type WorkspaceRepositoryContentDto = {
  syntaxSourceFile: RepositorySyntaxSourceDto | null;
  workspace: RepositoryWorkspaceDto;
};

export type WorkspaceRepositorySnapshotDto = WorkspaceRepositoryContentDto & {
  repositoryPath: string;
  revision: string;
};

export type WorkspaceRepositoryCommitDto = WorkspaceRepositoryContentDto & {
  baseRevision: string;
};

export type WorkspaceRepositoryCommitResultDto = {
  revision: string;
};

export type RepositoryAdapterKindDto = "browser" | "local" | "webdav";

export type RepositoryDescriptorDto = {
  adapter: RepositoryAdapterKindDto;
  id: string;
  label: string;
  repositoryPath: string;
};

export type RepositoryCatalogDto = {
  repositories: RepositoryDescriptorDto[];
};

export type CreateRepositoryDto = {
  content: WorkspaceRepositoryContentDto;
  id: string;
};
