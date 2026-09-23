// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStagingFor } from './sessionToolState.ts';
import type { CommandRuntime } from '../commands/index.ts';
import type { WorkspaceResourceVersionPolicy } from '../workspace/index.ts';
import type { ContentDocument } from '../commands/index.ts';

type Snapshot = AgentStagingFor<'workspace'>['base'];
type WorkspaceTreeNode =
  | {kind: 'note'; noteId: string; order: number; parentFolderId: string | null; title: string; updatedAt: string; version: `sha256:${string}`}
  | {kind: 'folder'; folderId: string; order: number; parentFolderId: string | null; title: string; version: `sha256:${string}`};
type WorkspaceTree = {nodes: WorkspaceTreeNode[]; repositoryId: string; revision: `sha256:${string}`; version: `sha256:${string}`};
export type WorkspaceAgentToolPorts = {
  load(repositoryId: string): Promise<Snapshot>;
  listRepositories(): Promise<{repositories: {id: string; label: string}[]}>;
  runtime: CommandRuntime;
  versions: WorkspaceResourceVersionPolicy;
  digest(value: unknown): `sha256:${string}`;
  resources: {
    tree(repositoryId: string, snapshot: Snapshot): WorkspaceTree;
    note(snapshot: Snapshot, noteId: string): Omit<ContentDocument, 'writingGuide'> | null;
  };
};
