// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentRuntimeKind, AgentScope } from "./agentTypes.ts";

export class AgentContextLimitError extends Error {
  constructor() {
    super("Agent conversation history reached its character budget");
    this.name = "AgentContextLimitError";
  }
}

export type AgentRuntimeTool = Readonly<{
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  name: string;
}>;

export type AgentRuntimeToolCall = Readonly<{
  arguments: unknown;
  callId: string;
  name: string;
}>;

export type AgentRuntimeTurnEvent =
  | { textDelta: string; type: "text-delta" }
  | { call: AgentRuntimeToolCall; type: "tool-call" }
  | { reason: string; type: "compaction-required" };

export type AgentRuntimeTurnRequest = Readonly<{
  executeTool(call: AgentRuntimeToolCall): Promise<unknown>;
  messages: readonly { content: string; role: "assistant" | "user" }[];
  onEvent(event: AgentRuntimeTurnEvent): Promise<void> | void;
  scope: AgentScope;
  signal: AbortSignal;
  tools: readonly AgentRuntimeTool[];
}>;

export type AgentRuntimeTurnResult = Readonly<{
  finalText: string;
  toolCalls: number;
}>;

export type AgentRuntimeSession = {
  cancel(): Promise<void>;
  dispose(): Promise<void>;
  runTurn(request: AgentRuntimeTurnRequest): Promise<AgentRuntimeTurnResult>;
};

export type AgentPrivateToolProcess = Readonly<{
  arguments: readonly string[];
  command: string;
  environment: Readonly<Record<string, string>>;
}>;

export type AgentRuntimePort = {
  kind: AgentRuntimeKind;
  openSession(input: {
    instructions: string;
    privateToolProcess?: AgentPrivateToolProcess;
    profileId: string;
    scope: AgentScope;
    sessionId: string;
  }): Promise<AgentRuntimeSession>;
};
