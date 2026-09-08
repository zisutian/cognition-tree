// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStagingFor } from './sessionToolState.ts';
import type {
  TodoCommandRuntime,
  TodoDomainVersions,
} from '../todo/index.ts';

import type {
  ParsedTodoIndexCollection,
  TodoLocalDate,
} from '../../core/todo/index.ts';


type Snapshot = AgentStagingFor<'todo'>['base'];
export type TodoAgentToolPorts = {
  load(): Promise<Snapshot>;
  runtime: TodoCommandRuntime;
  versions: TodoDomainVersions;
  digest(value: unknown): `sha256:${string}`;
  resources: {
    list(snapshot: Snapshot): { collections: { id: string }[] };
    read(parsed: ParsedTodoIndexCollection, today: TodoLocalDate): unknown;
  };
};
