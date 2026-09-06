// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentProposal } from '../agent/index.ts';
import type { AgentOperationReceipt } from '../operations/index.ts';
import type { ResolvedAgentConfiguration } from './configurationPort.ts';
import type { AgentRuntimeProfile } from './runtimeProfiles.ts';

export type AgentProposalCommitRoute = "destructive-confirmation" | "proposal-decision";

export type AgentProposalCommitContext = Readonly<{
  configuration: ResolvedAgentConfiguration;
  profile: AgentRuntimeProfile;
  runtimeKind: AgentOperationReceipt["runtimeKind"];
  sessionId: string;
}>;

export type AgentProposalCommitOutcome = Readonly<{
  proposal: AgentProposal;
  receipt: AgentOperationReceipt;
  replayed: boolean;
}>;

export type AgentProposalCommitRequest = Readonly<{
  context: AgentProposalCommitContext;
  ownerId: string;
  proposal: AgentProposal;
  requestId: string;
  route: AgentProposalCommitRoute;
}>;

export type AgentProposalCommitPort = Readonly<{
  commit(
    request: AgentProposalCommitRequest,
  ): Promise<AgentProposalCommitOutcome>;
}>;
