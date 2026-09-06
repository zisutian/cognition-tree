// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentProfileSummary, AgentStatus } from '../agent/agentClientPort.ts';
import type { AgentScope, AgentSessionSnapshot } from '../agent/agentTypes.ts';
import type { AgentProposalCommitPort } from './proposalCommitPort.ts';
import type { AgentRuntimeFactory, AgentPrivateToolsPort, AgentHostTools, AgentToolProtocolPort } from './runtimePorts.ts';
import type { ApplicationScheduler } from '../runtime/applicationScheduler.ts';
import type { AgentEventSink } from './sessionEventStream.ts';
import type { AgentProposal } from "../agent/index.ts";
import type { AgentHostRuntime } from "./runtimePorts.ts";
import type { AgentConfigurationPort } from "./configurationPort.ts";
import type { AgentAuditAvailabilityPort } from "./runtimePorts.ts";
import type { AgentServicePolicy } from "./servicePolicy.ts";
import { AgentServiceError } from "./errors.ts";
import { AgentProposalWorkflow } from "./proposalWorkflow.ts";
import { AgentConversationRunner } from "./conversationRunner.ts";
import { toAgentProposalView } from "../agent/agentTypes.ts";
import { AgentSessionPool } from "./sessionPool.ts";
import { AgentSessionOpener } from "./sessionOpener.ts";
import type { AgentSessionRecord } from "./sessionRecord.ts";

export { AgentServiceError } from "./errors.ts";
export type { AgentServiceErrorCode } from "./errors.ts";

export class AgentService {
  readonly #configurationStore: AgentConfigurationPort;
  readonly #conversation: AgentConversationRunner<AgentSessionRecord>;
  readonly #ipc: AgentPrivateToolsPort;
  readonly #ledger: AgentAuditAvailabilityPort | null;
  readonly #operations = new Set<Promise<unknown>>();
  readonly #proposalWorkflow: AgentProposalWorkflow<AgentSessionRecord>;
  readonly #servicePolicy: AgentServicePolicy;
  readonly #sessionOpener: AgentSessionOpener;
  readonly #sessionPool: AgentSessionPool;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor({
    configurationStore,
    ipc,
    ledger,
    proposalCommitter,
    runtime,
    runtimeFactory,
    servicePolicy,
    tools,
    protocol,
    scheduler,
  }: {
    configurationStore: AgentConfigurationPort;
    ipc: AgentPrivateToolsPort;
    ledger: AgentAuditAvailabilityPort | null;
    proposalCommitter: AgentProposalCommitPort;
    runtime: AgentHostRuntime;
    runtimeFactory: AgentRuntimeFactory;
    servicePolicy: AgentServicePolicy;
    tools: AgentHostTools;
    protocol: AgentToolProtocolPort;
    scheduler: ApplicationScheduler;
  }) {
    this.#configurationStore = configurationStore;
    this.#ipc = ipc;
    this.#ledger = ledger;
    this.#servicePolicy = servicePolicy;
    this.#conversation = new AgentConversationRunner({
      createId: () => runtime.createId(),
      emitProposal: (record, proposal) => this.#emitProposal(record, proposal),
      emitSnapshot: (record) => this.#emitSnapshot(record),
      tools,
      protocol,
    });
    this.#proposalWorkflow = new AgentProposalWorkflow({
      assertScopeAvailable: (record) =>
        tools.assertScopeAvailable(record.controller.snapshot().scope),
      committer: proposalCommitter,
      emitProposal: (record, proposal) => this.#emitProposal(record, proposal),
      isClosing: () => this.#disposed,
      scheduleReceiptSummary: (record, receipt) =>
        this.#conversation.scheduleReceiptSummary(record, receipt),
    });
    this.#sessionPool = new AgentSessionPool({
      ipc,
      scheduler,
      runtime,
      servicePolicy,
    });
    this.#sessionOpener = new AgentSessionOpener({
      assertOpen: () => this.#assertOpen(),
      configurationStore,
      createSnapshot: (record) => this.#snapshot(record),
      emitSnapshot: (record) => this.#emitSnapshot(record),
      executeTool: (sessionId, call) => this.#conversation.executeTool(
        this.#sessionPool.require(sessionId),
        call,
      ),
      ipc,
      ledger,
      residency: this.#sessionPool,
      runtime,
      runtimeFactory,
      servicePolicy,
      tools,
      protocol,
    });
  }

  async status(): Promise<AgentStatus> {
    try {
      const auditStatus = this.#ledger
        ? await this.#ledger.status()
        : { status: "unavailable" as const };
      const configuration = await this.#configurationStore.readSnapshot();
      const providers = new Map(configuration.providers.map((provider) => [
        provider.id,
        provider,
      ]));
      const profiles: AgentProfileSummary[] = configuration.profiles.map(
        (profile) => {
          const provider = providers.get(profile.providerId);

          if (!provider) {
            throw new Error(
              `Agent profile provider does not exist: ${profile.providerId}`,
            );
          }

          return {
            authenticationStatus: provider.authenticationStatus,
            availability: profile.availability,
            id: profile.id,
            kind: provider.kind,
            label: profile.label,
            model: profile.model,
            unavailableReason: profile.unavailableReason,
          };
        },
      );
      const configurationProblem = this.#servicePolicy.configurationProblem;

      return {
        configurationProblem,
        enabled: auditStatus.status === "available" &&
          configurationProblem === null &&
          profiles.some(({ availability }) => availability === "available"),
        profiles,
      };
    } catch (error) {
      return {
        configurationProblem: error instanceof Error
          ? error.message
          : "Agent configuration is unavailable",
        enabled: false,
        profiles: [],
      };
    }
  }

  listSessions() {
    return this.#sessionPool.list()
      .map((record) => this.#snapshot(record))
      .sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt));
  }

  getSession(sessionId: string) {
    const record = this.#sessionPool.require(sessionId);

    return this.#snapshot(record);
  }

  hasResidentSessions() {
    return this.#operations.size > 0 || this.#sessionPool.hasResidentSessions();
  }

  async createSession(request: {profileId: string; scope: AgentScope}) {
    this.#assertOpen();
    const execution = this.#sessionOpener.open(request);

    return await this.#sessionPool.trackStart(execution);
  }

  async deleteSession(sessionId: string) {
    this.#assertOpen();
    return await this.#trackOperation(this.#deleteSession(sessionId));
  }

  async #deleteSession(sessionId: string) {
    const record = this.#sessionPool.remove(sessionId);

    await this.#sessionPool.disposeRecord(record);
    return { deleted: true as const };
  }

  sendMessage(sessionId: string, content: string) {
    this.#assertOpen();
    const record = this.#sessionPool.require(sessionId);

    return this.#conversation.sendMessage(record, content);
  }

  async cancel(sessionId: string) {
    this.#assertOpen();
    return await this.#trackOperation(this.#cancel(sessionId));
  }

  async #cancel(sessionId: string) {
    const record = this.#sessionPool.require(sessionId);
    const turnId = record.controller.snapshot().activeTurnId;

    if (!turnId || !record.abortController) {
      throw new AgentServiceError("invalid_request", "Session has no active turn");
    }
    record.abortController.abort(new Error("Owner cancelled Agent turn"));
    record.controller.setUnavailable(
      "Agent session was cancelled and its runtime was stopped",
    );
    this.#emitSnapshot(record);
    if (record.capability) {
      this.#ipc.revoke(record.capability);
      record.capability = null;
    }
    await this.#sessionPool.stopRuntimeSession(record, true);
    return { cancelled: true as const };
  }

  connectEvents({
    afterSequence,
    sink,
    sessionId,
  }: {
    afterSequence: number;
    sink: AgentEventSink;
    sessionId: string;
  }) {
    const record = this.#sessionPool.require(sessionId);

    record.events.connect({
      afterSequence,
      createSnapshot: (sequence) => this.#snapshot(record, sequence),
      sink,
    });
  }

  closeEventStreams() {
    this.#sessionPool.closeEventStreams();
  }

  async decideProposal({
    decision,
    ownerId,
    proposalId,
    requestId,
    sessionId,
  }: {
    decision: "approve" | "reject";
    ownerId: string;
    proposalId: string;
    requestId: string;
    sessionId: string;
  }) {
    this.#assertOpen();
    const record = this.#sessionPool.require(sessionId);

    return await this.#trackOperation(this.#proposalWorkflow.decide({
      decision,
      ownerId,
      proposalId,
      record,
      requestId,
    }));
  }

  async confirmDestruction({
    ownerId,
    proposalId,
    requestId,
    sessionId,
  }: {
    ownerId: string;
    proposalId: string;
    requestId: string;
    sessionId: string;
  }) {
    this.#assertOpen();
    const record = this.#sessionPool.require(sessionId);

    return await this.#trackOperation(this.#proposalWorkflow.confirmDestruction({
      ownerId,
      proposalId,
      record,
      requestId,
    }));
  }

  dispose() {
    if (this.#disposePromise) return this.#disposePromise;
    this.#disposed = true;
    const poolDisposal = this.#sessionPool.dispose();

    this.#disposePromise = this.#finishDisposal(
      [...this.#operations],
      poolDisposal,
    );
    return this.#disposePromise;
  }

  async #finishDisposal(
    operations: readonly Promise<unknown>[],
    poolDisposal: Promise<void>,
  ) {
    await Promise.allSettled([...operations, poolDisposal]);
    await this.#conversation.waitForIdle();
    await this.#ipc.dispose();
  }

  #trackOperation<Result>(execution: Promise<Result>) {
    this.#operations.add(execution);
    void execution.finally(() => this.#operations.delete(execution))
      .catch(() => undefined);
    return execution;
  }

  #assertOpen() {
    if (this.#disposed) {
      throw new AgentServiceError(
        "session_unavailable",
        "Agent service is closing",
      );
    }
  }

  #snapshot(
    record: AgentSessionRecord,
    sequence = record.events.sequence,
  ): AgentSessionSnapshot {
    const snapshot = record.controller.snapshot();

    return {
      ...snapshot,
      profileDigest: record.configuration.profile.digest,
      profileLabel: record.configuration.profile.label,
      profileModel: record.configuration.profile.model,
      profileVersion: record.configuration.profile.version,
      proposals: snapshot.proposals.map((proposal) => ({
        baseRevision: proposal.baseRevision,
        changes: proposal.changes,
        destructive: proposal.destructive,
        digest: proposal.digest,
        diff: proposal.diff,
        id: proposal.id,
        review: proposal.review,
        status: proposal.status,
        store: proposal.store,
        version: proposal.version,
      })),
      providerDigest: record.configuration.provider.digest,
      providerId: record.configuration.provider.id,
      providerVersion: record.configuration.provider.version,
      sequence,
    };
  }

  #emitProposal(record: AgentSessionRecord, proposal: AgentProposal) {
    record.events.emit({
      proposal: toAgentProposalView(proposal),
      type: "proposal-updated",
    });
    this.#emitSnapshot(record);
  }

  #emitSnapshot(record: AgentSessionRecord) {
    record.events.emitSnapshot((sequence) => this.#snapshot(record, sequence));
  }
}
