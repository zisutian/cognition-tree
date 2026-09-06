// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStagingFor } from './sessionToolState.ts';
import type { JournalAgentCommandRuntime } from '../journal/journalAgentCommandPreparation.ts';
import type { JournalDomainVersions } from '../journal/journalDomainCommands.ts';
import type { ParsedJournalIndexEntry } from '../../core/journal/indexes/journalParseIndex.ts';

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
