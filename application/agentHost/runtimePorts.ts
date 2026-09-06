// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentRuntimePort,
  AgentPrivateToolProcess,
  AgentRuntimeTool,
  AgentRuntimeToolCall,
  AgentScope,
} from '../agent/index.ts';

import type { ResolvedAgentConfiguration } from './configurationPort.ts';
import type { AgentRuntimeProfile } from './runtimeProfiles.ts';
import type { AgentToolSession, AgentToolExecution } from './sessionToolState.ts';
import type { AgentOperationReceipt } from '../operations/index.ts';

export type ConfiguredAgentRuntimeInput = Readonly<{
  configuration: ResolvedAgentConfiguration;
  openAiAuthentication?: 'allow-unauthenticated' | 'require-api-key';
  profile: AgentRuntimeProfile;
}>;
export type AgentRuntimeFactory = Readonly<{
  create(input: ConfiguredAgentRuntimeInput): AgentRuntimePort;
}>;
export type AgentHostRuntime = { createId(): string; now(): Date };
export function readAgentHostTimestamp(runtime: AgentHostRuntime) {
  const date = runtime.now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('Agent time source returned an invalid date.');
  }
  return date.toISOString();
}
export type AgentHostTools = {
  assertScopeAvailable(scope: AgentScope): Promise<void>;
  execute(record: AgentToolSession, call: AgentRuntimeToolCall): Promise<AgentToolExecution>;
};
export type AgentToolProtocolPort = {
  toolsForScope(scope: AgentScope): readonly AgentRuntimeTool[];
  serializeReceipt(receipt: AgentOperationReceipt): string;
};
export type AgentPrivateToolsPort = {
  open(input: {
    expiresAt: number;
    sessionId: string;
    tools: readonly AgentRuntimeTool[];
    execute(call: AgentRuntimeToolCall): Promise<unknown>;
  }): Promise<{ capability: string; process: AgentPrivateToolProcess }>;
  revoke(capability: string): void;
  dispose(): Promise<void>;
};
export type AgentAuditAvailabilityPort = {
  status(): Promise<
    { status: 'available' } | { status: 'unavailable'; message: string }
  >;
};
