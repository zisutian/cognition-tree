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
import type { ContentDocument } from '../commands/index.ts';
import type { TodoItemState } from '../todo/index.ts';


type Snapshot = AgentStagingFor<'todo'>['base'];
export type TodoAgentToolPorts = {
  load(): Promise<Snapshot>;
  runtime: TodoCommandRuntime;
  versions: TodoDomainVersions;
  digest(value: unknown): `sha256:${string}`;
  resources: {
    list(snapshot: Snapshot): {
      collections: {id: string; name: string; stateVersion: `sha256:${string}`; version: `sha256:${string}`}[];
      orderVersion: `sha256:${string}`;
      revision: `sha256:${string}`;
    };
    read(parsed: ParsedTodoIndexCollection, today: TodoLocalDate): {
      document: Omit<ContentDocument, 'writingGuide'>;
      items: TodoItemState[];
      stateVersion: `sha256:${string}`;
    };
  };
};
