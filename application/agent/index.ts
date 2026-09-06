// SPDX-License-Identifier: GPL-3.0-or-later

export type {
  AgentApplication,
  AgentScopeCatalog,
  AgentScopeOption,
} from "./agentClientApplication.ts";
export type {
  AgentChatProfileParameters,
  AgentChatReasoningEffort,
  AgentCodexDeviceLoginStatus,
  AgentCodexProfileParameters,
  AgentConfigurationSnapshot,
  AgentConformanceCheckStatus,
  AgentOllamaDiscovery,
  AgentOllamaResidentContext,
  AgentProfileConformance,
  AgentProfileInput,
  AgentProfileParameters,
  AgentProfileView,
  AgentProviderAuthenticationType,
  AgentProviderInput,
  AgentProviderKind,
  AgentProviderProbe,
  AgentProviderView,
  AgentToolCallMode,
} from "./agentConfiguration.ts";
export type {
  AgentClientController,
  AgentClientState,
} from "./agentClientController.ts";
export type {
  AgentClientEvent,
  AgentClientEventStream,
  AgentClientPort,
  AgentProfileSummary,
  AgentStatus,
} from "./agentClientPort.ts";
export type {
  AgentConfigurationController,
  AgentConfigurationPort,
  AgentConfigurationState,
} from "./agentConfigurationController.ts";
export {
  AgentContextLimitError,
  AgentRuntimeProtocolError,
} from "./agentRuntimePort.ts";
export type {
  AgentExactCommitResult,
  AgentProposalDigestPort,
} from "./agentProposal.ts";
export type {
  AgentMessage,
  AgentProposal,
  AgentProposalStatus,
  AgentProposalView,
  AgentRuntimeKind,
  AgentScope,
  AgentSessionSnapshot,
  AgentSessionState,
  AgentStoreReference,
} from "./agentTypes.ts";
export type {
  AgentPrivateToolProcess,
  AgentRuntimePort,
  AgentRuntimeSession,
  AgentRuntimeTool,
  AgentRuntimeToolCall,
  AgentRuntimeTurnEvent,
  AgentRuntimeTurnRequest,
  AgentRuntimeTurnResult,
} from "./agentRuntimePort.ts";
export type {
  AgentProfilePreferencePort,
} from "./agentProfilePreference.ts";
export {
  AgentProposalStateError,
  commitAgentProposalExactly,
  confirmAgentProposalDestruction,
  createAgentProposal,
  decideAgentProposal,
  markAgentProposalFailed,
  markAgentProposalIndeterminate,
  markAgentProposalStale,
} from "./agentProposal.ts";
export {
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  assertAgentResourceInScope,
  resolveWorkspaceAgentScope,
} from "./agentScope.ts";
export {
  AgentSessionController,
  AgentSessionStateError,
} from "./agentSessionController.ts";
export type {
  AgentSessionRuntime,
} from "./agentSessionController.ts";
export type {
  AgentSyntaxGuide,
  AgentSyntaxKnowledge,
} from "./agentSyntaxPolicy.ts";
export {
  agentSyntaxKnowledgeMatches,
  createAgentSyntaxKnowledge,
  projectAgentSyntaxGuide,
} from "./agentSyntaxPolicy.ts";
export {
  createAgentClientController,
} from "./agentClientController.ts";
export {
  createAgentConfigurationController,
} from "./agentConfigurationController.ts";
export {
  createAgentRuntimeInstructions,
} from "./agentInstructionPolicy.ts";
export {
  toAgentProposalView,
} from "./agentTypes.ts";
