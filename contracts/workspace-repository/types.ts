// SPDX-License-Identifier: GPL-3.0-or-later

export const workspaceRepositorySchemaVersion = 3 as const;
export const repositorySyntaxFileName = "workspace.toml";

export type RepositoryRevisionDto = `sha256:${string}`;
export type LocalDraftRevisionDto = `draft:${string}`;

export type RepositoryNoteDto = {
  id: string;
  source: string;
};

export type RepositoryTreeNodeDto =
  | {
      children: RepositoryTreeNodeDto[];
      folderId: string;
      kind: "folder";
      title: string;
    }
  | {
      kind: "note";
      noteId: string;
    };

export type RepositoryWorkspaceDto = {
  id: string;
  name: string;
  notes: RepositoryNoteDto[];
  tree: RepositoryTreeNodeDto[];
};

export type WorkspaceRepositoryContentDto = {
  schemaVersion: typeof workspaceRepositorySchemaVersion;
  syntaxSource: string | null;
  workspace: RepositoryWorkspaceDto;
};

export type WorkspaceRepositorySnapshotDto = {
  content: WorkspaceRepositoryContentDto;
  revision: RepositoryRevisionDto;
};

export type WorkspaceRepositoryCommitDto = {
  baseRevision: RepositoryRevisionDto;
  content: WorkspaceRepositoryContentDto;
};

export type WorkspaceRepositoryCommitResultDto = {
  revision: RepositoryRevisionDto;
};

export type RepositoryAdapterKindDto = "browser" | "local" | "webdav";

export type RepositoryDescriptorDto = {
  adapter: RepositoryAdapterKindDto;
  id: string;
  label: string;
  locationLabel: string;
};

export type RepositoryApiErrorCodeDto =
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

export type RepositoryCatalogIssueDto = {
  code: Extract<
    RepositoryApiErrorCodeDto,
    | "adapter_unavailable"
    | "repository_busy"
    | "repository_corrupt"
    | "unsupported_repository_version"
  >;
  id: string;
  locationLabel: string;
  message: string;
};

export type RepositoryCatalogDto = {
  issues: RepositoryCatalogIssueDto[];
  repositories: RepositoryDescriptorDto[];
};

export type CreateRepositoryDto = {
  content: WorkspaceRepositoryContentDto;
  id: string;
  label: string;
};

export type RepositoryApiErrorDto = {
  code: RepositoryApiErrorCodeDto;
  currentRevision?: RepositoryRevisionDto;
  message: string;
  requestId: string;
};
