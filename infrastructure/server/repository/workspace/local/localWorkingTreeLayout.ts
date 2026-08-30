// SPDX-License-Identifier: GPL-3.0-or-later

import type { RepositoryRevisionDto } from "../../../../../contracts/workspace/types.ts";
import { workspaceRepositorySchemaVersion } from "../../../../../contracts/workspace/types.ts";
import type { CtnCanonicalSourceAnalysis } from "../../../../../core/ctn/analysis/sourceAnalysis.ts";
import type { WorkspaceSyntax } from "../../../../../core/workspace/context/workspaceSyntax.ts";

export const localControlDirectoryName = ".ctn";
export const localIndexFileName = "index.json";
export const localLayoutVersion = 1 as const;
export const maximumLocalManagedFileBytes = 64 * 1024 * 1024;
export const localNoteMetadataDirectoryName = "note-metadata";
export const localRepositoryMetadataFileName = "repository.json";
export const localSyntaxDirectoryName = "syntax";
export const localTransactionsDirectoryName = "transactions";

export type LocalRepositoryMetadata = {
  currentRevision: RepositoryRevisionDto;
  label: string;
  layoutVersion: typeof localLayoutVersion;
  repositoryId: string;
  schemaVersion: typeof workspaceRepositorySchemaVersion;
  workspace: {
    id: string;
    name: string;
  };
};

type LocalIndexEntryBase = {
  device: string | null;
  inode: string | null;
  order: number;
  path: string;
};

export type LocalFolderIndexEntry = LocalIndexEntryBase & {
  folderId: string;
  kind: "folder";
  subtreeHash: string;
};

export type LocalNoteIndexEntry = LocalIndexEntryBase & {
  kind: "note";
  noteId: string;
  sourceHash: string;
};

export type LocalIndexEntry = LocalFolderIndexEntry | LocalNoteIndexEntry;

export type LocalRepositoryIndex = {
  entries: LocalIndexEntry[];
  layoutVersion: typeof localLayoutVersion;
};

export type LocalNoteMetadataBlock = {
  createdAt: string;
  editableLineNumber: number;
  fingerprint: string;
  id: string;
  indentText: string;
  updatedAt: string;
};

export type LocalNoteMetadata = {
  blocks: LocalNoteMetadataBlock[];
  editableSource: string;
  noteId: string;
  schemaVersion: 1;
};

export type LocalManagedFileSet = Map<string, string>;

export type LocalWorkingTreeProjection = {
  analysisOverrides: ReadonlyMap<string, CtnCanonicalSourceAnalysis>;
  content: import("../../../../../contracts/workspace/types.ts").WorkspaceRepositoryContentDto;
  files: LocalManagedFileSet;
  index: LocalRepositoryIndex;
  metadata: LocalRepositoryMetadata;
  revision: RepositoryRevisionDto;
  syntaxOverrides: ReadonlyMap<string, WorkspaceSyntax>;
};
