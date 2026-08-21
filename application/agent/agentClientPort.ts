// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentProposalView,
  AgentRuntimeKind,
  AgentScope,
  AgentSessionSnapshot,
} from "./agentTypes.ts";

export type AgentProfileSummary = Readonly<{
  authenticationStatus: "configured" | "missing" | "unknown";
  availability: "available" | "unavailable";
  id: string;
  kind: AgentRuntimeKind;
  label: string;
  model: string | null;
  unavailableReason: string | null;
}>;

export type AgentStatus = Readonly<{
  configurationProblem: string | null;
  enabled: boolean;
  profiles: readonly AgentProfileSummary[];
}>;

export type AgentClientEvent =
  | {
      messageId: string;
      sequence: number;
      sessionId: string;
      textDelta: string;
      type: "message-delta";
    }
  | {
      proposal: AgentProposalView;
      sequence: number;
      sessionId: string;
      type: "proposal-updated";
    }
  | {
      sequence: number;
      sessionId: string;
      snapshot: AgentSessionSnapshot;
      type: "session-snapshot";
    }
  | {
      code: string;
      message: string;
      sequence: number;
      sessionId: string;
      type: "problem";
    }
  | {
      sequence: number;
      sessionId: string;
      status: "cancelled" | "completed" | "failed";
      turnId: string;
      type: "turn-completed";
    };

export type AgentClientEventStream = {
  close(): void;
};

export type AgentClientPort = {
  cancel(sessionId: string): Promise<void>;
  confirmDestruction(
    sessionId: string,
    proposalId: string,
  ): Promise<AgentProposalView>;
  createSession(input: {
    profileId: string;
    scope: AgentScope;
  }): Promise<AgentSessionSnapshot>;
  decideProposal(
    sessionId: string,
    proposalId: string,
    decision: "approve" | "reject",
  ): Promise<AgentProposalView>;
  deleteSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<AgentSessionSnapshot>;
  getStatus(): Promise<AgentStatus>;
  listSessions(): Promise<AgentSessionSnapshot[]>;
  openEvents(input: {
    afterSequence: number;
    onClose(error: unknown): void;
    onEvent(event: AgentClientEvent): void;
    sessionId: string;
  }): AgentClientEventStream;
  sendMessage(sessionId: string, content: string): Promise<void>;
};
