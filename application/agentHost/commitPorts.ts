// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStoreReference } from '../agent/agentTypes.ts';
import type { PreparedVersionedStore } from '../persistence/versionedRepository.ts';
import type { DomainChangeSet } from '../../core/sync/domainChangeSet.ts';

export type AgentCommitStorePort = {
  getStore(store: AgentStoreReference): Promise<PreparedVersionedStore<unknown, unknown, `sha256:${string}`>>;
};
export type AgentCommitEventsPort = {
  publish(store: AgentStoreReference, revision: `sha256:${string}`, changes: DomainChangeSet): void;
};
