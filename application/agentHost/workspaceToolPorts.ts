// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStagingFor } from './sessionToolState.ts';
import type { CommandRuntime } from '../commands/index.ts';
import type { WorkspaceResourceVersionPolicy } from '../workspace/index.ts';
import type { ContentDocument } from '../commands/index.ts';
import type { WorkspaceTreeResource } from '../content/index.ts';

type Snapshot = AgentStagingFor<'workspace'>['base'];
export type WorkspaceAgentToolPorts = {
  load(repositoryId: string): Promise<Snapshot>;
  listRepositories(): Promise<{repositories: {id: string; label: string}[]}>;
  runtime: CommandRuntime;
  versions: WorkspaceResourceVersionPolicy;
  digest(value: unknown): `sha256:${string}`;
  resources: {
    tree(repositoryId: string, snapshot: Snapshot): WorkspaceTreeResource;
    note(snapshot: Snapshot, noteId: string): Omit<ContentDocument, 'writingGuide'> | null;
  };
};
