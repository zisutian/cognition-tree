// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStagingFor } from './sessionToolState.ts';
import type {
  JournalAgentCommandRuntime,
  JournalDomainVersions,
} from '../journal/index.ts';

import type { ParsedJournalIndexEntry } from '../../core/journal/index.ts';

type Snapshot = AgentStagingFor<'journal'>['base'];
export type JournalAgentToolPorts = {
  load(): Promise<Snapshot>;
  runtime: JournalAgentCommandRuntime;
  versions: JournalDomainVersions;
  digest(value: unknown): `sha256:${string}`;
  resources: {
    list(snapshot: Snapshot): { entries: { id: string }[] };
    read(parsed: ParsedJournalIndexEntry): unknown;
  };
};
