// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentRuntimeKind, AgentStoreReference } from '../agent/index.ts';

export type AgentOperationReceipt = Readonly<{
  afterRevision: string | null;
  approvingOwnerId: string;
  beforeRevision: string;
  changeMetadata: { blockIds: string[]; resourceIds: string[] };
  digest: string;
  occurredAt: string;
  profileDigest: string;
  profileId: string;
  profileVersion: number;
  proposalId: string;
  proposalVersion: number;
  providerDigest: string;
  providerId: string;
  providerVersion: number;
  result: 'committed' | 'failed' | 'stale';
  runtimeKind: AgentRuntimeKind;
  sessionId: string;
  store: AgentStoreReference;
}>;
