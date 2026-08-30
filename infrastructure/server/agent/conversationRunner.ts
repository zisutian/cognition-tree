// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentContextLimitError,
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  type AgentProposal,
  type AgentRuntimeSession,
  type AgentRuntimeTool,
  type AgentRuntimeToolCall,
} from "../../../application/agent/index.ts";
import type {
  AgentOperationAuditEntryDto,
} from "../../../contracts/agent/schemas.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { AgentProfileTurnQueue } from "./profileTurnQueue.ts";
import { AgentSessionEventStream } from "./sessionEventStream.ts";
import { AgentSessionTools } from "./sessionTools.ts";
import { agentRuntimeToolsForScope } from "./sessionToolProtocol.ts";
import type { AgentToolSession } from "./sessionToolState.ts";

export type AgentConversationRecord = AgentToolSession & {
  abortController: AbortController | null;
  events: AgentSessionEventStream;
  profile: { id: string };
  runtimeSession: AgentRuntimeSession;
};

function isAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted ||
    (error instanceof Error && error.name === "AbortError");
}

export class AgentConversationRunner<Record extends AgentConversationRecord> {
  readonly #createId: () => string;
  readonly #emitProposal: (record: Record, proposal: AgentProposal) => void;
  readonly #emitSnapshot: (record: Record) => void;
  readonly #profileTurns = new AgentProfileTurnQueue();
  readonly #tools: AgentSessionTools;

  constructor({
    createId,
    emitProposal,
    emitSnapshot,
    tools,
  }: {
    createId: () => string;
    emitProposal: (record: Record, proposal: AgentProposal) => void;
    emitSnapshot: (record: Record) => void;
    tools: AgentSessionTools;
  }) {
    this.#createId = createId;
    this.#emitProposal = emitProposal;
    this.#emitSnapshot = emitSnapshot;
    this.#tools = tools;
  }

  sendMessage(record: Record, content: string) {
    const turnId = this.#createId();
    const queued = this.#profileTurns.has(record.profile.id);

    record.controller.beginTurn(turnId, queued);
    record.controller.addMessage("user", content);
    record.controller.clearProblem();
    record.abortController = new AbortController();
    this.#emitSnapshot(record);
    this.#profileTurns.enqueue(
      record.profile.id,
      () => this.#runConversationTurn(record, turnId),
    );
    return { accepted: true as const, turnId };
  }

  async executeTool(record: Record, call: AgentRuntimeToolCall) {
    const execution = await this.#tools.execute(record, call);

    if (execution.proposal) {
      record.controller.putProposal(execution.proposal);
      this.#emitProposal(record, execution.proposal);
    }
    return execution.result;
  }

  scheduleReceiptSummary(
    record: Record,
    receipt: AgentOperationAuditEntryDto,
  ) {
    if (record.controller.snapshot().activeTurnId) return;
    const turnId = this.#createId();
    const queued = this.#profileTurns.has(record.profile.id);
    const abortController = new AbortController();

    record.controller.beginTurn(turnId, queued);
    record.abortController = abortController;
    this.#emitSnapshot(record);
    this.#profileTurns.enqueue(
      record.profile.id,
      () => this.#runReceiptSummaryTurn(
        record,
        receipt,
        turnId,
        abortController.signal,
      ),
    );
  }

  waitForIdle() {
    return this.#profileTurns.waitForIdle();
  }

  async #runReceiptSummaryTurn(
    record: Record,
    receipt: AgentOperationAuditEntryDto,
    turnId: string,
    signal: AbortSignal,
  ) {
    if (signal.aborted) {
      this.#completeCancelled(record, turnId);
      return;
    }
    record.controller.markTurnRunning(turnId);
    const messageId = this.#createId();

    record.controller.startAssistantMessage(messageId);
    const receiptMessage = serializeJsonIteratively({
      afterRevision: receipt.afterRevision,
      beforeRevision: receipt.beforeRevision,
      changeMetadata: receipt.changeMetadata,
      proposalId: receipt.proposalId,
      result: receipt.result,
      store: receipt.store,
    }, { sortObjectKeys: true });
    try {
      const result = await record.runtimeSession.runTurn({
        executeTool: () => Promise.reject(
          new AgentScopeViolationError(
            "Tools are disabled for commit summary",
          ),
        ),
        messages: [{
          content: `Summarize this structured commit receipt for the owner. Do not perform any tool call: ${receiptMessage}`,
          role: "user",
        }],
        onEvent: (event) => {
          if (event.type !== "text-delta") return;
          record.controller.appendAssistantMessage(messageId, event.textDelta);
          record.events.emit({
            messageId,
            textDelta: event.textDelta,
            type: "message-delta",
          });
        },
        scope: record.controller.snapshot().scope,
        signal,
        tools: [],
      });
      const summary = record.controller.snapshot().messages.find(({ id }) =>
        id === messageId
      );

      if (!summary?.content && result.finalText) {
        record.controller.appendAssistantMessage(messageId, result.finalText);
        record.events.emit({
          messageId,
          textDelta: result.finalText,
          type: "message-delta",
        });
      }
      record.controller.finishTurn(turnId);
      record.abortController = null;
      record.events.emit({
        status: "completed",
        turnId,
        type: "turn-completed",
      });
      this.#emitSnapshot(record);
    } catch (error) {
      record.abortController = null;
      if (isAbort(error, signal)) {
        this.#completeCancelled(record, turnId);
        return;
      }
      const message = error instanceof Error
        ? error.message
        : "Agent receipt summary failed";

      record.controller.failTurn(turnId, message);
      record.events.emit({
        code: "receipt_summary_failed",
        message,
        type: "problem",
      });
      record.events.emit({ status: "failed", turnId, type: "turn-completed" });
      this.#emitSnapshot(record);
    }
  }

  async #runConversationTurn(record: Record, turnId: string) {
    const controller = record.controller;
    const signal = record.abortController?.signal;

    if (!signal) return;
    if (signal.aborted) {
      this.#completeCancelled(record, turnId);
      return;
    }
    controller.markTurnRunning(turnId);
    const messageId = this.#createId();

    controller.startAssistantMessage(messageId);
    this.#emitSnapshot(record);
    try {
      const scope = controller.snapshot().scope;

      await this.#tools.assertScopeAvailable(scope);
      await this.#runRuntimeWithCompaction(
        record,
        messageId,
        signal,
        agentRuntimeToolsForScope(scope),
      );
      controller.discardEmptyAssistantMessage(messageId);
      controller.finishTurn(turnId);
      record.abortController = null;
      record.events.emit({
        status: "completed",
        turnId,
        type: "turn-completed",
      });
      this.#emitSnapshot(record);
    } catch (error) {
      record.abortController = null;
      controller.discardEmptyAssistantMessage(messageId);
      if (isAbort(error, signal)) {
        this.#completeCancelled(record, turnId);
        return;
      }
      const message = error instanceof Error
        ? error.message
        : "Agent turn failed";

      if (error instanceof AgentScopeUnavailableError) {
        controller.setUnavailable(message);
      } else {
        controller.failTurn(turnId, message);
      }
      record.events.emit({ code: "agent_turn_failed", message, type: "problem" });
      record.events.emit({ status: "failed", turnId, type: "turn-completed" });
      this.#emitSnapshot(record);
    }
  }

  async #runRuntimeWithCompaction(
    record: Record,
    messageId: string,
    signal: AbortSignal,
    tools: readonly AgentRuntimeTool[],
  ) {
    let compacted = false;

    while (true) {
      let compactedThisAttempt = false;
      const beforeLength = record.controller.snapshot().messages.find(({ id }) =>
        id === messageId
      )?.content.length ?? 0;

      try {
        const result = await record.runtimeSession.runTurn({
          executeTool: (call) => this.executeTool(record, call),
          messages: record.controller.snapshot().messages.map(
            ({ content, role }) => ({ content, role }),
          ),
          onEvent: async (event) => {
            if (event.type === "text-delta") {
              record.controller.appendAssistantMessage(messageId, event.textDelta);
              record.events.emit({
                messageId,
                textDelta: event.textDelta,
                type: "message-delta",
              });
            } else if (event.type === "compaction-required" && !compacted) {
              compacted = true;
              compactedThisAttempt = true;
              this.#compactHistory(record, event.reason, messageId);
              this.#emitSnapshot(record);
            }
          },
          scope: record.controller.snapshot().scope,
          signal,
          tools,
        });
        const current = record.controller.snapshot().messages.find(({ id }) =>
          id === messageId
        );

        if (
          current && current.content.length === beforeLength && result.finalText
        ) {
          record.controller.appendAssistantMessage(messageId, result.finalText);
          record.events.emit({
            messageId,
            textDelta: result.finalText,
            type: "message-delta",
          });
        }
        return;
      } catch (error) {
        if (!(error instanceof AgentContextLimitError)) throw error;
        if (compactedThisAttempt) continue;
        if (compacted) throw error;
        compacted = true;
        this.#compactHistory(record, "会话历史预算已达到", messageId);
        this.#emitSnapshot(record);
      }
    }
  }

  #compactHistory(record: Record, reason: string, preserveMessageId?: string) {
    const messages = record.controller.snapshot().messages;
    const recent = messages.slice(-6).map(({ content, role }) =>
      `${role}: ${content.slice(0, 1_000)}`
    ).join("\n");

    record.controller.compactHistory(`${reason}\n${recent}`, preserveMessageId);
  }

  #completeCancelled(record: Record, turnId: string) {
    const activeTurnId = record.controller.snapshot().activeTurnId;

    if (activeTurnId === turnId) {
      record.controller.cancelTurn(turnId);
    } else if (activeTurnId !== null) {
      throw new Error("Agent cancellation does not match the active turn");
    }
    record.abortController = null;
    record.events.emit({ status: "cancelled", turnId, type: "turn-completed" });
    this.#emitSnapshot(record);
  }
}
