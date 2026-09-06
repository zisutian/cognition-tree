// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStagingFor } from './sessionToolState.ts';
import type { TodoAgentCommandRuntime } from '../todo/todoAgentCommandPreparation.ts';
import type { TodoDomainVersions } from '../todo/todoDomainCommands.ts';
import type { ParsedTodoIndexCollection } from '../../core/todo/indexes/todoParseIndex.ts';
import type { TodoLocalDate } from '../../core/todo/recurrence/todoLocalDate.ts';

type Snapshot = AgentStagingFor<'todo'>['base'];
export type TodoAgentToolPorts = {
  load(): Promise<Snapshot>;
  runtime: TodoAgentCommandRuntime;
  versions: TodoDomainVersions;
  digest(value: unknown): `sha256:${string}`;
  resources: {
    list(snapshot: Snapshot): { collections: { id: string }[] };
    read(parsed: ParsedTodoIndexCollection, today: TodoLocalDate): unknown;
  };
};
