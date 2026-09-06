// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStagingFor } from './sessionToolState.ts';
import type { CommandRuntime } from '../commands/commandRuntime.ts';
import type { WorkspaceResourceVersionPolicy } from '../workspace/commands/workspaceAgentCommandPreparation.ts';

type Snapshot = AgentStagingFor<'workspace'>['base'];
type WorkspaceResource = {kind: 'note'; noteId: string} | {kind: 'folder'; folderId: string};
export type WorkspaceAgentToolPorts = {
  load(repositoryId: string): Promise<Snapshot>;
  listRepositories(): Promise<{repositories: {id: string; label: string}[]}>;
  runtime: CommandRuntime;
  versions: WorkspaceResourceVersionPolicy;
  digest(value: unknown): `sha256:${string}`;
  resources: {
    tree(repositoryId: string, snapshot: Snapshot): {nodes: WorkspaceResource[]};
    note(snapshot: Snapshot, noteId: string): object | null;
  };
};
