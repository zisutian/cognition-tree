// SPDX-License-Identifier: GPL-3.0-or-later

import type { WriteAdmissionPort } from "../../../application/runtime/index.ts";
import { serverApplicationScheduler } from '../platform/index.ts';
import type {
  ApiBuiltInCatalog,
  WorkspaceRepositoryCatalog,
} from '../repository/index.ts';
import type { ApiRuntime } from '../api/http/index.ts';
import type { ApiEventHub } from '../api/sync/index.ts';
import type { DomainRevisionTracker } from '../../../application/sync/index.ts';
import type { OperationLedger } from '../operations/index.ts';
import {
  AgentService,
  AgentProposalCommitter,
} from '../../../application/agentHost/index.ts';
import type {
  AgentRuntimeFactory,
  AgentToolProtocolPort,
  AgentServicePolicy,
} from '../../../application/agentHost/index.ts';
import { serializeJsonIteratively } from '../../../contracts/common/index.ts';
import type { AgentConfigurationStore } from '../agent/index.ts';
import {
  ConfiguredAgentRuntimeFactory,
  AgentPrivateIpcServer,
  createPrivateAgentTools,
  AgentProviderTargetPolicy,
  agentRuntimeToolsForScope,
} from '../agent/index.ts';
import { createServerAgentTools } from "./agentToolRuntime.ts";
import type {
  SearchQuery,
  SearchAccess,
} from "../../../application/search/index.ts";

type CommitDependencies = {
  builtInCatalog: ApiBuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  eventHub: ApiEventHub;
  revisionTracker: DomainRevisionTracker;
  ledger: OperationLedger | null;
  runtime: ApiRuntime;
};
const protocol: AgentToolProtocolPort = {
  toolsForScope: agentRuntimeToolsForScope,
  serializeReceipt: (receipt) => serializeJsonIteratively({
    afterRevision: receipt.afterRevision, beforeRevision: receipt.beforeRevision,
    changeMetadata: receipt.changeMetadata, proposalId: receipt.proposalId,
    result: receipt.result, store: receipt.store,
  }, { sortObjectKeys: true }),
};
export function createServerAgentService(input: CommitDependencies & {
  configurationStore: AgentConfigurationStore;
  writes: WriteAdmissionPort;
  ipc?: AgentPrivateIpcServer;
  projectRoot?: string;
  runtimeFactory?: AgentRuntimeFactory;
  search: SearchQuery<SearchAccess>;
  servicePolicy: AgentServicePolicy;
  targetPolicy?: AgentProviderTargetPolicy;
}) {
  const ipc = input.ipc ?? new AgentPrivateIpcServer();
  const proposalCommitter = new AgentProposalCommitter({
    ledger: input.ledger,
    runtime: input.runtime,
    stores: {
getStore: async (store) => store.domain === 'workspace'
        ? input.catalog.getStore(store.repositoryId)
        : input.builtInCatalog.getStore(store.domain)
},
    events: {
publish(store, revision, changes) {
        if (store.domain === 'workspace') input.revisionTracker.observeWorkspace(store.repositoryId, revision);
        else input.revisionTracker.observeDomain(store.domain, revision);
        input.eventHub.publish(input.revisionTracker.checkpoint({ sequence: input.eventHub.sequence, streamId: input.eventHub.streamId }), changes);
      }
},
  });
  return new AgentService({
    configurationStore: input.configurationStore,
    ipc: createPrivateAgentTools(ipc),
    ledger: input.ledger,
    proposalCommitter: { commit: request => input.writes.run(() => proposalCommitter.commit(request)) },
    runtime: input.runtime,
    runtimeFactory: input.runtimeFactory ?? new ConfiguredAgentRuntimeFactory({ projectRoot: input.projectRoot, targetPolicy: input.targetPolicy }),
    servicePolicy: input.servicePolicy,
    tools: createServerAgentTools(input),
    protocol,
    scheduler: serverApplicationScheduler,
  });
}
