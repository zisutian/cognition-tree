// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentStoreReference } from '../agent/index.ts';
import type { PreparedVersionedStore } from '../persistence/index.ts';
import type { DomainChangeSet } from '../../core/sync/index.ts';

export type AgentCommitStorePort = {
  getStore(store: AgentStoreReference): Promise<PreparedVersionedStore<unknown, unknown, `sha256:${string}`>>;
};
export type AgentCommitEventsPort = {
  publish(store: AgentStoreReference, revision: `sha256:${string}`, changes: DomainChangeSet): void;
};
