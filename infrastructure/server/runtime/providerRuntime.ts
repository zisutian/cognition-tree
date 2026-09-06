// SPDX-License-Identifier: GPL-3.0-or-later

import { createServerDeviceLoginOperations } from "./deviceLoginRuntime.ts";
import path from 'node:path';
import { AgentProviderOperations } from '../../../application/agentHost/providerOperations.ts';
import { AgentConformanceOperations } from '../../../application/agentHost/conformanceOperations.ts';
import type { CommandRuntime } from '../../../application/commands/commandRuntime.ts';
import { ConfiguredAgentRuntimeFactory } from '../agent/configuredAgentRuntimeFactory.ts';
import type { AgentConfigurationStore } from '../agent/configurationStore.ts';
import { AgentProviderProbeService } from '../agent/providerProbe.ts';
import { AgentProviderTargetPolicy } from '../agent/providerTargetPolicy.ts';
import { agentRuntimeToolsForScope } from '../agent/sessionToolProtocol.ts';
import { serverApplicationScheduler } from '../platform/applicationScheduler.ts';

export function createServerProviderOperations({
  configurationStore,
  codexDeviceLoginTtlMilliseconds = 15 * 60 * 1_000,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  projectRoot = process.cwd(),
  runtime,
  targetPolicy = new AgentProviderTargetPolicy(),
}: {
  configurationStore: AgentConfigurationStore;
  codexDeviceLoginTtlMilliseconds?: number;
  fetch?: typeof fetch;
  projectRoot?: string;
  runtime: CommandRuntime;
  targetPolicy?: AgentProviderTargetPolicy;
}) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  return new AgentProviderOperations({
    codexDeviceLogins: createServerDeviceLoginOperations({configurationStore, projectRoot: resolvedProjectRoot, runtime, ttlMilliseconds: codexDeviceLoginTtlMilliseconds}),
    conformance: new AgentConformanceOperations({
      configurationStore, runtime,
      runtimeFactory: new ConfiguredAgentRuntimeFactory({projectRoot: resolvedProjectRoot, targetPolicy}),
      tools: agentRuntimeToolsForScope({domain: 'workspace', repositoryId: 'conformance-only', target: {kind: 'repository'}}).filter(({name}) => name === 'list' || name === 'describe_syntax' || name === 'stage_workspace_create_note'),
      scheduler: serverApplicationScheduler,
    }),
    probe: new AgentProviderProbeService({configurationStore, fetch: fetchFn, runtime, targetPolicy}),
  });
}
