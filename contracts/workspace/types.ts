// SPDX-License-Identifier: GPL-3.0-or-later

export const workspaceRepositorySchemaVersion = 4 as const;
export const repositorySyntaxIndexFileName = "index.json";

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

export type RepositorySyntaxFileDto = {
  id: string;
  source: string;
};

export type RepositorySyntaxCatalogDto = {
  activeFileId: string | null;
  files: RepositorySyntaxFileDto[];
};

export type WorkspaceRepositoryContentDto = {
  schemaVersion: typeof workspaceRepositorySchemaVersion;
  syntax: RepositorySyntaxCatalogDto;
  workspace: RepositoryWorkspaceDto;
};

export type WorkspaceRepositorySnapshotDto = {
  content: WorkspaceRepositoryContentDto;
  revision: RepositoryRevisionDto;
};

export type WorkspaceRepositorySyncRequestDto = {
  base: WorkspaceRepositorySnapshotDto;
  content: WorkspaceRepositoryContentDto;
};

export type WorkspaceRepositorySyncResultDto = {
  outcome: "auto-merged" | "committed" | "unchanged";
  snapshot: WorkspaceRepositorySnapshotDto;
};

export type RepositoryLocationDto = {
  hostPath: string | null;
  serverPath: string;
};

export type RepositoryDescriptorDto = {
  id: string;
  label: string;
  labelIssue: "conflict" | "nonportable" | "reserved" | null;
  location: RepositoryLocationDto;
};

export type RenameRepositoryDto = {
  label: string;
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
  location: RepositoryLocationDto | null;
  message: string;
};

export type RepositoryCatalogDto = {
  issues: RepositoryCatalogIssueDto[];
  repositories: RepositoryDescriptorDto[];
};

export type CreateRepositoryDto = {
  content: WorkspaceRepositoryContentDto;
  label: string;
};
