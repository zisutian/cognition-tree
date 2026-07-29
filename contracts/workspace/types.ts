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

export type WorkspaceRepositoryCommitDto = {
  baseRevision: RepositoryRevisionDto;
  content: WorkspaceRepositoryContentDto;
};

export type WorkspaceRepositoryCommitResultDto = {
  revision: RepositoryRevisionDto;
};

export type RepositoryAdapterKindDto = "browser" | "local" | "webdav";

export type RepositoryLocationDto =
  | {
      hostPath: string | null;
      serverPath: string;
      type: "local";
    }
  | {
      type: "webdav";
      url: string;
    }
  | {
      databaseName: string;
      type: "browser";
    };

export type RepositoryAuthenticationDto =
  | { type: "none" }
  | { password: string; type: "basic"; username: string };

export type RepositoryDescriptorDto = {
  adapter: RepositoryAdapterKindDto;
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
  adapter: RepositoryAdapterKindDto;
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
  status: "deleting" | "fault";
};

export type RepositoryCatalogDto = {
  creatableAdapters: RepositoryAdapterKindDto[];
  issues: RepositoryCatalogIssueDto[];
  repositories: RepositoryDescriptorDto[];
};

export type CreateRepositoryDto =
  | {
      adapter: "local";
      content: WorkspaceRepositoryContentDto;
      label: string;
    }
  | {
      adapter: "webdav";
      authentication: RepositoryAuthenticationDto;
      initialContent: WorkspaceRepositoryContentDto;
      label: string;
      url: string;
    };

export type RepositoryDeletionModeDto =
  | "delete-managed-data"
  | "remove-connection";

export type RepositoryDeletionResultDto = {
  status: "deleted" | "deleting";
};
