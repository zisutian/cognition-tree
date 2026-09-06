// SPDX-License-Identifier: GPL-3.0-or-later

import { AgentService } from '../../../application/agentHost/service.ts';
import type { AgentRuntimeFactory, AgentToolProtocolPort } from '../../../application/agentHost/runtimePorts.ts';
import type { AgentServicePolicy } from '../../../application/agentHost/servicePolicy.ts';
import type { ApplicationScheduler } from '../../../application/runtime/applicationScheduler.ts';
import { serializeJsonIteratively } from '../../../contracts/common/json.ts';
import type { AgentConfigurationStore } from '../agent/configurationStore.ts';
import { ConfiguredAgentRuntimeFactory } from '../agent/configuredAgentRuntimeFactory.ts';
import { AgentPrivateIpcServer } from '../agent/privateIpc.ts';
import { createPrivateAgentTools } from '../agent/privateToolProcess.ts';
import { AgentProposalCommitter } from '../agent/proposalCommitter.ts';
import { AgentProviderTargetPolicy } from '../agent/providerTargetPolicy.ts';
import { AgentSessionTools } from '../agent/sessionTools.ts';
import { agentRuntimeToolsForScope } from '../agent/sessionToolProtocol.ts';
import type { ApiSearchService } from '../api/search.ts';

type CommitDependencies = ConstructorParameters<typeof AgentProposalCommitter>[0];
const agentHostScheduler: ApplicationScheduler = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => clearTimeout(timer);
  },
};
const protocol: AgentToolProtocolPort = {
  toolsForScope: agentRuntimeToolsForScope,
  serializeReceipt: (receipt) => serializeJsonIteratively({
    afterRevision: receipt.afterRevision, beforeRevision: receipt.beforeRevision,
    changeMetadata: receipt.changeMetadata, proposalId: receipt.proposalId,
    result: receipt.result, store: receipt.store,
  }, {sortObjectKeys: true}),
};
export function createServerAgentService(input: CommitDependencies & {
  configurationStore: AgentConfigurationStore;
  ipc?: AgentPrivateIpcServer;
  projectRoot?: string;
  runtimeFactory?: AgentRuntimeFactory;
  search: ApiSearchService;
  servicePolicy: AgentServicePolicy;
  targetPolicy?: AgentProviderTargetPolicy;
}) {
  const ipc = input.ipc ?? new AgentPrivateIpcServer();
  return new AgentService({
    configurationStore: input.configurationStore,
    ipc: createPrivateAgentTools(ipc),
    ledger: input.ledger,
    proposalCommitter: new AgentProposalCommitter(input),
    runtime: input.runtime,
    runtimeFactory: input.runtimeFactory ?? new ConfiguredAgentRuntimeFactory({projectRoot: input.projectRoot, targetPolicy: input.targetPolicy}),
    servicePolicy: input.servicePolicy,
    tools: new AgentSessionTools(input),
    protocol,
    scheduler: agentHostScheduler,
  });
}
