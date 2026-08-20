// SPDX-License-Identifier: GPL-3.0-or-later

import {
  toAgentProposalView,
  type AgentMessage,
  type AgentProposal,
  type AgentScope,
  type AgentSessionSnapshot,
  type AgentSessionState,
} from "./agentTypes.ts";

export class AgentSessionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentSessionStateError";
  }
}

export type AgentSessionRuntime = {
  createId(): string;
  now(): string;
};

export class AgentSessionController {
  #activeTurnId: string | null = null;
  readonly #createdAt: string;
  readonly #id: string;
  #lastActiveAt: string;
  readonly #messages: AgentMessage[] = [];
  #problem: string | null = null;
  readonly #profileId: string;
  readonly #proposals = new Map<string, AgentProposal>();
  readonly #runtime: AgentSessionRuntime;
  readonly #scope: AgentScope;
  #sequence = 0;
  #state: AgentSessionState = "idle";

  constructor({
    id,
    profileId,
    runtime,
    scope,
  }: {
    id: string;
    profileId: string;
    runtime: AgentSessionRuntime;
    scope: AgentScope;
  }) {
    this.#id = id;
    this.#profileId = profileId;
    this.#runtime = runtime;
    this.#scope = structuredClone(scope);
    this.#createdAt = runtime.now();
    this.#lastActiveAt = this.#createdAt;
  }

  addMessage(role: AgentMessage["role"], content: string) {
    const message: AgentMessage = {
      content,
      createdAt: this.#runtime.now(),
      id: this.#runtime.createId(),
      role,
    };

    this.#messages.push(message);
    this.#touch();
    return message;
  }

  startAssistantMessage(messageId: string) {
    if (this.#messages.some(({ id }) => id === messageId)) {
      throw new AgentSessionStateError("Message id already belongs to session");
    }
    const message: AgentMessage = {
      content: "",
      createdAt: this.#runtime.now(),
      id: messageId,
      role: "assistant",
    };

    this.#messages.push(message);
    this.#touch();
    return message;
  }

  appendAssistantMessage(messageId: string, textDelta: string) {
    const index = this.#messages.findIndex(({ id }) => id === messageId);
    const message = this.#messages[index];

    if (!message || message.role !== "assistant") {
      throw new AgentSessionStateError(
        "Assistant message does not belong to session",
      );
    }
    this.#messages[index] = { ...message, content: message.content + textDelta };
    this.#touch();
    return this.#messages[index]!;
  }

  beginTurn(turnId: string, queued: boolean) {
    if (this.#activeTurnId !== null) {
      throw new AgentSessionStateError("Session already has an active turn");
    }
    if (
      this.#state === "awaiting-approval" ||
      this.#state === "awaiting-destructive-confirmation"
    ) {
      throw new AgentSessionStateError(
        "A proposal must be decided before another turn can start",
      );
    }
    this.#activeTurnId = turnId;
    this.#state = queued ? "queued" : "running";
    this.#touch();
  }

  markTurnRunning(turnId: string) {
    this.#assertActiveTurn(turnId);
    this.#state = "running";
    this.#touch();
  }

  finishTurn(turnId: string) {
    this.#assertActiveTurn(turnId);
    this.#activeTurnId = null;
    this.#state = this.#pendingProposalState() ?? "idle";
    this.#touch();
  }

  failTurn(turnId: string, message: string) {
    this.#assertActiveTurn(turnId);
    this.#activeTurnId = null;
    this.#problem = message;
    this.#state = "idle";
    this.#touch();
  }

  cancelTurn(turnId: string) {
    this.#assertActiveTurn(turnId);
    this.#activeTurnId = null;
    this.#state = this.#pendingProposalState() ?? "idle";
    this.#touch();
  }

  setUnavailable(message: string) {
    this.#problem = message;
    this.#state = "unavailable";
    this.#activeTurnId = null;
    this.#touch();
  }

  clearProblem() {
    this.#problem = null;
    this.#touch();
  }

  putProposal(proposal: AgentProposal) {
    const existing = this.#proposals.get(proposal.id);

    if (existing && existing.version !== proposal.version) {
      throw new AgentSessionStateError("Proposal version cannot be replaced");
    }
    this.#proposals.set(proposal.id, proposal);
    this.#state = proposal.status === "awaiting-destructive-confirmation"
      ? "awaiting-destructive-confirmation"
      : proposal.status === "pending"
        ? "awaiting-approval"
        : this.#pendingProposalState() ?? "idle";
    this.#touch();
  }

  getProposal(proposalId: string) {
    const proposal = this.#proposals.get(proposalId);

    if (!proposal) {
      throw new AgentSessionStateError("Proposal does not belong to session");
    }
    return proposal;
  }

  compactHistory(summary: string, preserveMessageId?: string) {
    const preserved = preserveMessageId
      ? this.#messages.find(({ id }) => id === preserveMessageId)
      : undefined;

    this.#messages.splice(0, this.#messages.length, {
      content: `上下文已压缩：${summary}`,
      createdAt: this.#runtime.now(),
      id: this.#runtime.createId(),
      role: "assistant",
    }, ...(preserved ? [preserved] : []));
    this.#touch();
  }

  snapshot(): AgentSessionSnapshot {
    return {
      activeTurnId: this.#activeTurnId,
      createdAt: this.#createdAt,
      id: this.#id,
      lastActiveAt: this.#lastActiveAt,
      messages: structuredClone(this.#messages),
      problem: this.#problem,
      profileId: this.#profileId,
      proposals: [...this.#proposals.values()].map(toAgentProposalView),
      scope: structuredClone(this.#scope),
      sequence: this.#sequence,
      state: this.#state,
    };
  }

  #pendingProposalState(): AgentSessionState | null {
    for (const proposal of this.#proposals.values()) {
      if (proposal.status === "awaiting-destructive-confirmation") {
        return "awaiting-destructive-confirmation";
      }
      if (proposal.status === "pending") return "awaiting-approval";
    }
    return null;
  }

  #assertActiveTurn(turnId: string) {
    if (this.#activeTurnId !== turnId) {
      throw new AgentSessionStateError("Turn is not active in this session");
    }
  }

  #touch() {
    this.#lastActiveAt = this.#runtime.now();
    this.#sequence += 1;
  }
}
