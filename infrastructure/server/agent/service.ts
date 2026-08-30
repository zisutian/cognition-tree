// SPDX-License-Identifier: GPL-3.0-or-later

import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  confirmAgentProposalDestruction,
  createAgentRuntimeInstructions,
  decideAgentProposal,
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  AgentSessionController,
  AgentSessionStateError,
  type AgentProposal,
  type AgentRuntimePort,
  type AgentRuntimeSession,
  type AgentRuntimeTool,
  type AgentRuntimeToolCall,
  type AgentScope,
  type AgentSyntaxKnowledge,
} from "../../../application/agent/index.ts";
import type {
  AgentCreateSessionRequestDto,
  AgentOperationAuditEntryDto,
  AgentProfileSummaryDto,
  AgentSessionSnapshotDto,
  AgentStatusDto,
} from "../../../contracts/agent/schemas.ts";
import { AgentSessionSnapshotSchema } from "../../../contracts/agent/schemas.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import type { ApiSearchService } from "../api/search.ts";
import type { ApiEventHub } from "../api/sync/events.ts";
import type { ApiRevisionTracker } from "../api/sync/revisionTracker.ts";
import { AgentPrivateIpcServer } from "./privateIpc.ts";
import {
  AgentContextLimitError,
} from "./openAiChatRuntime.ts";
import type {
  AgentConfigurationStore,
  ResolvedAgentConfiguration,
} from "./configurationStore.ts";
import type {
  AgentConfigurationProfileUse,
} from "./configurationAccess.ts";
import type { OperationLedger } from "../operations/operationLedger.ts";
import {
  createAgentRuntimeProfile,
  type AgentRuntimeProfile,
} from "./runtimeProfiles.ts";
import {
  ConfiguredAgentRuntimeFactory,
  type AgentRuntimeFactory,
} from "./configuredAgentRuntimeFactory.ts";
import type { AgentServicePolicy } from "./servicePolicy.ts";
import { AgentServiceError } from "./errors.ts";
import {
  AgentProposalCommitter,
  type AgentProposalCommitRoute,
} from "./proposalCommitter.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import { AgentProfileTurnQueue } from "./profileTurnQueue.ts";
import { AgentSessionTools } from "./sessionTools.ts";
import { toAgentProposalDto } from "./proposalCodec.ts";
import { agentRuntimeToolsForScope } from "./sessionToolProtocol.ts";
import type { AgentStaging } from "./sessionToolState.ts";
import {
  AgentSessionEventStream,
} from "./sessionEventStream.ts";

export { AgentServiceError } from "./errors.ts";
export type { AgentServiceErrorCode } from "./errors.ts";

type SessionRecord = {
  abortController: AbortController | null;
  capability: string | null;
  controller: AgentSessionController;
  disposePromise: Promise<void> | null;
  events: AgentSessionEventStream;
  configuration: ResolvedAgentConfiguration;
  configurationUse: AgentConfigurationProfileUse;
  profile: AgentRuntimeProfile;
  runtime: AgentRuntimePort;
  runtimeSession: AgentRuntimeSession;
  runtimeStopPromise: Promise<void> | null;
  staging: AgentStaging | null;
  syntaxKnowledge: AgentSyntaxKnowledge | null;
};

function isAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted ||
    (error instanceof Error && error.name === "AbortError");
}

function sessionMcpEntrypoint() {
  const current = fileURLToPath(import.meta.url);
  const extension = path.extname(current);

  return path.join(path.dirname(current), `sessionMcpServer${extension}`);
}

export class AgentService {
  readonly #configurationStore: AgentConfigurationStore;
  readonly #ipc: AgentPrivateIpcServer;
  readonly #ledger: OperationLedger | null;
  readonly #openingProfiles = new Map<string, number>();
  readonly #operations = new Set<Promise<unknown>>();
  readonly #profileTurns = new AgentProfileTurnQueue();
  readonly #proposalCommitter: AgentProposalCommitter;
  readonly #runtime: ApiRuntime;
  readonly #runtimeFactory: AgentRuntimeFactory;
  readonly #servicePolicy: AgentServicePolicy;
  readonly #sessionDisposals = new Set<Promise<void>>();
  readonly #sessionStarts = new Set<Promise<AgentSessionSnapshotDto>>();
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #sweeper: NodeJS.Timeout;
  readonly #tools: AgentSessionTools;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor({
    builtInCatalog,
    catalog,
    configurationStore,
    eventHub,
    ipc = new AgentPrivateIpcServer(),
    ledger,
    projectRoot = process.cwd(),
    revisionTracker,
    runtime,
    runtimeFactory,
    search,
    servicePolicy,
    targetPolicy = new AgentProviderTargetPolicy(),
  }: {
    builtInCatalog: ApiBuiltInCatalog;
    catalog: WorkspaceRepositoryCatalog;
    configurationStore: AgentConfigurationStore;
    eventHub: ApiEventHub;
    ipc?: AgentPrivateIpcServer;
    ledger: OperationLedger | null;
    projectRoot?: string;
    revisionTracker: ApiRevisionTracker;
    runtime: ApiRuntime;
    runtimeFactory?: AgentRuntimeFactory;
    search: ApiSearchService;
    servicePolicy: AgentServicePolicy;
    targetPolicy?: AgentProviderTargetPolicy;
  }) {
    this.#configurationStore = configurationStore;
    this.#ipc = ipc;
    this.#ledger = ledger;
    this.#proposalCommitter = new AgentProposalCommitter({
      builtInCatalog,
      catalog,
      eventHub,
      ledger,
      revisionTracker,
      runtime,
    });
    this.#runtime = runtime;
    this.#runtimeFactory = runtimeFactory ?? new ConfiguredAgentRuntimeFactory({
      projectRoot,
      targetPolicy,
    });
    this.#servicePolicy = servicePolicy;
    this.#tools = new AgentSessionTools({
      builtInCatalog,
      catalog,
      runtime,
      search,
    });
    this.#sweeper = setInterval(() => {
      void this.#expireSessions();
    }, 60_000);
    this.#sweeper.unref();
  }

  async status(): Promise<AgentStatusDto> {
    try {
      const auditStatus = this.#ledger
        ? await this.#ledger.status()
        : { status: "unavailable" as const };
      const configuration = await this.#configurationStore.readSnapshot();
      const providers = new Map(configuration.providers.map((provider) => [
        provider.id,
        provider,
      ]));
      const profiles: AgentProfileSummaryDto[] = configuration.profiles.map(
        (profile) => {
          const provider = providers.get(profile.providerId)!;

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
    this.#removeExpiredSessionsWithoutWaiting();
    return [...this.#sessions.values()]
      .map((record) => this.#snapshot(record))
      .sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt));
  }

  getSession(sessionId: string) {
    const record = this.#requireSession(sessionId);

    return this.#snapshot(record);
  }

  hasResidentSessions() {
    this.#removeExpiredSessionsWithoutWaiting();
    return this.#sessionDisposals.size > 0 || this.#sessionStarts.size > 0 ||
      this.#sessions.size > 0;
  }

  async createSession(request: AgentCreateSessionRequestDto) {
    this.#assertOpen();
    const execution = this.#openSession(request);

    this.#sessionStarts.add(execution);
    try {
      return await execution;
    } finally {
      this.#sessionStarts.delete(execution);
    }
  }

  async #openSession(request: AgentCreateSessionRequestDto) {
    const configurationUse = this.#configurationStore.access.beginProfileUse(
      request.profileId,
    );

    let resident = false;

    try {
      const snapshot = await this.#createSession(
        request,
        configurationUse,
        () => {
          resident = true;
        },
      );

      this.#assertOpen();
      return snapshot;
    } finally {
      if (!resident) configurationUse.release();
    }
  }

  async #createSession(
    request: AgentCreateSessionRequestDto,
    configurationUse: AgentConfigurationProfileUse,
    transferConfigurationUse: () => void,
  ) {
    this.#removeExpiredSessionsWithoutWaiting();
    if (!this.#ledger) {
      throw new AgentServiceError(
        "profile_unavailable",
        this.#servicePolicy.configurationProblem ??
          "Agent operation ledger is unavailable",
      );
    }
    const ledgerStatus = await this.#ledger.status();

    this.#assertOpen();
    if (ledgerStatus.status !== "available") {
      throw new AgentServiceError(
        "profile_unavailable",
        "Agent operation audit is unavailable",
      );
    }
    const configuration = await this.#configurationStore.resolveProfile(
      request.profileId,
      configurationUse,
    );

    this.#assertOpen();
    if (!configuration || configuration.profile.availability !== "available") {
      throw new AgentServiceError(
        "profile_unavailable",
        configuration?.profile.unavailableReason ?? "Agent profile is unavailable",
      );
    }
    const resident = [...this.#sessions.values()].filter(({ profile }) =>
      profile.id === configuration.profile.id
    ).length;
    const opening = this.#openingProfiles.get(configuration.profile.id) ?? 0;

    if (resident + opening >= configuration.profile.maxResidentSessions) {
      throw new AgentServiceError(
        "session_capacity_reached",
        "Agent profile has reached maxResidentSessions",
      );
    }
    this.#openingProfiles.set(configuration.profile.id, opening + 1);
    const scope = request.scope as AgentScope;

    try {
      await this.#tools.assertScopeAvailable(scope);
      this.#assertOpen();
      const sessionId = this.#runtime.createId();
      const profile = createAgentRuntimeProfile(configuration);
      const controller = new AgentSessionController({
        id: sessionId,
        profileId: profile.id,
        runtime: {
          createId: () => this.#runtime.createId(),
          now: () => readApiRuntimeNow(this.#runtime).timestamp,
        },
        scope,
      });
      const runtimePort = this.#runtimeFactory.create({
        configuration,
        openAiAuthentication: "require-api-key",
        profile,
      });
      let capability: string | null = null;
      let record: SessionRecord | null = null;
      let runtimeSession: AgentRuntimeSession | null = null;

      try {
        const privateToolProcess = profile.kind === "codex"
          ? await this.#createPrivateToolProcess(sessionId, scope)
          : undefined;

        capability = privateToolProcess?.capability ?? null;
        this.#assertOpen();
        runtimeSession = await runtimePort.openSession({
          instructions: createAgentRuntimeInstructions(scope),
          ...(privateToolProcess
            ? { privateToolProcess: privateToolProcess.process }
            : {}),
          profileId: profile.id,
          scope,
          sessionId,
        });
        this.#assertOpen();
        record = {
          abortController: null,
          capability,
          configuration,
          configurationUse,
          controller,
          disposePromise: null,
          events: new AgentSessionEventStream(sessionId),
          profile,
          runtime: runtimePort,
          runtimeSession,
          runtimeStopPromise: null,
          staging: null,
          syntaxKnowledge: null,
        };

        transferConfigurationUse();
        this.#sessions.set(sessionId, record);
        this.#emitSnapshot(record);
        return this.#snapshot(record);
      } catch (error) {
        if (record && this.#sessions.get(sessionId) === record) {
          this.#sessions.delete(sessionId);
        }
        if (record) {
          await this.#disposeRecord(record);
        } else {
          if (capability) this.#ipc.revoke(capability);
          if (runtimeSession) await runtimeSession.dispose();
        }
        throw error;
      }
    } finally {
      const remaining = (this.#openingProfiles.get(configuration.profile.id) ?? 1) - 1;

      if (remaining > 0) {
        this.#openingProfiles.set(configuration.profile.id, remaining);
      } else {
        this.#openingProfiles.delete(configuration.profile.id);
      }
    }
  }

  async deleteSession(sessionId: string) {
    this.#assertOpen();
    return await this.#trackOperation(this.#deleteSession(sessionId));
  }

  async #deleteSession(sessionId: string) {
    const record = this.#requireSession(sessionId);

    this.#sessions.delete(sessionId);
    await this.#disposeRecord(record);
    return { deleted: true as const };
  }

  sendMessage(sessionId: string, content: string) {
    this.#assertOpen();
    const record = this.#requireSession(sessionId);
    const turnId = this.#runtime.createId();
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

  async cancel(sessionId: string) {
    this.#assertOpen();
    return await this.#trackOperation(this.#cancel(sessionId));
  }

  async #cancel(sessionId: string) {
    const record = this.#requireSession(sessionId);
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
    await this.#stopRuntimeSession(record, true);
    return { cancelled: true as const };
  }

  connectEvents({
    afterSequence,
    headers,
    response,
    sessionId,
  }: {
    afterSequence: number;
    headers: OutgoingHttpHeaders;
    response: ServerResponse;
    sessionId: string;
  }) {
    const record = this.#requireSession(sessionId);

    record.events.connect({
      afterSequence,
      createSnapshot: (sequence) => this.#snapshot(record, sequence),
      headers,
      response,
    });
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
    return await this.#trackOperation(this.#decideProposal({
      decision,
      ownerId,
      proposalId,
      requestId,
      sessionId,
    }));
  }

  async #decideProposal({
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
    const record = this.#requireSession(sessionId);

    await this.#tools.assertScopeAvailable(record.controller.snapshot().scope);
    let proposal = record.controller.getProposal(proposalId);

    if (proposal.status === "committed" || proposal.status === "stale" ||
        proposal.status === "failed") {
      return toAgentProposalDto(proposal);
    }
    if (proposal.status === "rejected") {
      if (decision !== "reject") {
        throw new AgentServiceError("invalid_request", "Proposal was rejected");
      }
      return toAgentProposalDto(proposal);
    }
    if (proposal.status === "pending") {
      proposal = decideAgentProposal(proposal, decision);
      record.controller.putProposal(proposal);
      this.#emitProposal(record, proposal);
    }
    if (decision === "reject") {
      if (proposal.status !== "rejected") {
        throw new AgentServiceError(
          "invalid_request",
          "Proposal has already been approved",
        );
      }
      return toAgentProposalDto(proposal);
    }
    if (proposal.status === "awaiting-destructive-confirmation") {
      return toAgentProposalDto(proposal);
    }
    return this.#commit(
      record,
      proposal,
      ownerId,
      requestId,
      "proposal-decision",
    );
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
    return await this.#trackOperation(this.#confirmDestruction({
      ownerId,
      proposalId,
      requestId,
      sessionId,
    }));
  }

  async #confirmDestruction({
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
    const record = this.#requireSession(sessionId);

    await this.#tools.assertScopeAvailable(record.controller.snapshot().scope);
    let proposal = record.controller.getProposal(proposalId);

    if (proposal.status === "committed" || proposal.status === "stale" ||
        proposal.status === "failed") {
      return toAgentProposalDto(proposal);
    }
    proposal = confirmAgentProposalDestruction(proposal);
    record.controller.putProposal(proposal);
    this.#emitProposal(record, proposal);
    return this.#commit(
      record,
      proposal,
      ownerId,
      requestId,
      "destructive-confirmation",
    );
  }

  dispose() {
    if (this.#disposePromise) return this.#disposePromise;
    this.#disposed = true;
    clearInterval(this.#sweeper);
    const records = [...this.#sessions.values()];

    this.#sessions.clear();
    const disposals = records.map((record) => this.#disposeRecord(record));

    this.#disposePromise = this.#finishDisposal(
      [...this.#sessionStarts],
      [...this.#operations],
      disposals,
    );
    return this.#disposePromise;
  }

  async #finishDisposal(
    starts: readonly Promise<AgentSessionSnapshotDto>[],
    operations: readonly Promise<unknown>[],
    disposals: readonly Promise<void>[],
  ) {
    await Promise.allSettled([...starts, ...operations, ...disposals]);
    await this.#profileTurns.waitForIdle();
    await Promise.allSettled(this.#sessionDisposals.values());
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
    record: SessionRecord,
    sequence = record.events.sequence,
  ): AgentSessionSnapshotDto {
    const snapshot = record.controller.snapshot();

    return parseAgentSchema(AgentSessionSnapshotSchema, {
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
    });
  }

  #requireSession(sessionId: string) {
    const record = this.#sessions.get(sessionId);

    if (!record) {
      throw new AgentServiceError("not_found", "Agent session does not exist");
    }
    if (this.#isExpired(record)) {
      this.#sessions.delete(sessionId);
      void this.#disposeRecord(record);
      throw new AgentServiceError("session_unavailable", "Agent session expired");
    }
    return record;
  }

  async #createPrivateToolProcess(sessionId: string, scope: AgentScope) {
    const endpoint = await this.#ipc.start();
    await this.#tools.assertScopeAvailable(scope);
    const tools = agentRuntimeToolsForScope(scope);
    const expiresAt = Date.parse(readApiRuntimeNow(this.#runtime).timestamp) +
      this.#servicePolicy.absoluteTtlMilliseconds;
    const capability = this.#ipc.register({
      expiresAt,
      handle: (request) => this.#executeTool(this.#requireSession(sessionId), {
        arguments: request.tool.input,
        callId: request.id,
        name: request.tool.name,
      }),
      listTools: () => tools.map((tool) => ({
        description: tool.description,
        inputSchema: { ...tool.inputSchema },
        name: tool.name,
      })),
      sessionId,
    });

    return {
      capability,
      process: {
        arguments: [sessionMcpEntrypoint()],
        command: process.execPath,
        environment: {
          CTN_AGENT_IPC_ENDPOINT: endpoint,
          CTN_AGENT_SESSION_CAPABILITY: capability,
          CTN_AGENT_SESSION_ID: sessionId,
        },
      },
    };
  }

  async #runConversationTurn(record: SessionRecord, turnId: string) {
    const controller = record.controller;
    const signal = record.abortController?.signal;

    if (!signal) return;
    if (signal.aborted) {
      this.#completeCancelled(record, turnId);
      return;
    }
    controller.markTurnRunning(turnId);
    const messageId = this.#runtime.createId();

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
      record.events.emit({ status: "completed", turnId, type: "turn-completed" });
      this.#emitSnapshot(record);
    } catch (error) {
      record.abortController = null;
      controller.discardEmptyAssistantMessage(messageId);
      if (isAbort(error, signal)) {
        this.#completeCancelled(record, turnId);
        return;
      }
      const message = error instanceof Error ? error.message : "Agent turn failed";

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
    record: SessionRecord,
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
          executeTool: (call) => this.#executeTool(record, call),
          messages: record.controller.snapshot().messages.map(({ content, role }) => ({
            content,
            role,
          })),
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

        if (current && current.content.length === beforeLength && result.finalText) {
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
        this.#compactHistory(
          record,
          "会话历史预算已达到",
          messageId,
        );
        this.#emitSnapshot(record);
      }
    }
  }

  #compactHistory(
    record: SessionRecord,
    reason: string,
    preserveMessageId?: string,
  ) {
    const messages = record.controller.snapshot().messages;
    const recent = messages.slice(-6).map(({ content, role }) =>
      `${role}: ${content.slice(0, 1_000)}`
    ).join("\n");

    record.controller.compactHistory(
      `${reason}\n${recent}`,
      preserveMessageId,
    );
  }

  #completeCancelled(record: SessionRecord, turnId: string) {
    try {
      record.controller.cancelTurn(turnId);
    } catch (error) {
      if (!(error instanceof AgentSessionStateError)) throw error;
    }
    record.abortController = null;
    record.events.emit({ status: "cancelled", turnId, type: "turn-completed" });
    this.#emitSnapshot(record);
  }

  async #executeTool(record: SessionRecord, call: AgentRuntimeToolCall) {
    const execution = await this.#tools.execute(record, call);

    if (execution.proposal) {
      record.controller.putProposal(execution.proposal);
      this.#emitProposal(record, execution.proposal);
    }
    return execution.result;
  }

  async #commit(
    record: SessionRecord,
    proposal: AgentProposal,
    ownerId: string,
    requestId: string,
    route: AgentProposalCommitRoute,
  ) {
    const outcome = await this.#proposalCommitter.commit({
      context: {
        configuration: record.configuration,
        profile: record.profile,
        runtimeKind: record.runtime.kind,
        sessionId: record.controller.snapshot().id,
      },
      ownerId,
      proposal,
      requestId,
      route,
    });

    record.controller.putProposal(outcome.proposal);
    if (!this.#disposed) this.#emitProposal(record, outcome.proposal);
    if (outcome.receipt.result === "committed") {
      if (!outcome.replayed && !this.#disposed) {
        this.#scheduleReceiptSummary(record, outcome.receipt);
      }
      return toAgentProposalDto(outcome.proposal);
    }
    if (outcome.receipt.result === "stale") {
      throw new AgentServiceError(
        "proposal_stale",
        "Store revision changed after the proposal was staged",
      );
    }
    throw new AgentServiceError("session_unavailable", "Agent commit failed");
  }

  #scheduleReceiptSummary(
    record: SessionRecord,
    receipt: AgentOperationAuditEntryDto,
  ) {
    if (record.controller.snapshot().activeTurnId) return;
    const turnId = this.#runtime.createId();
    const queued = this.#profileTurns.has(record.profile.id);
    const controller = new AbortController();

    record.controller.beginTurn(turnId, queued);
    record.abortController = controller;
    this.#emitSnapshot(record);
    this.#profileTurns.enqueue(record.profile.id, async () => {
      if (controller.signal.aborted) {
        this.#completeCancelled(record, turnId);
        return;
      }
      record.controller.markTurnRunning(turnId);
      const messageId = this.#runtime.createId();

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
            new AgentScopeViolationError("Tools are disabled for commit summary"),
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
          signal: controller.signal,
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
        record.events.emit({ status: "completed", turnId, type: "turn-completed" });
        this.#emitSnapshot(record);
      } catch (error) {
        record.abortController = null;
        if (isAbort(error, controller.signal)) {
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
    });
  }

  #emitProposal(record: SessionRecord, proposal: AgentProposal) {
    record.events.emit({
      proposal: toAgentProposalDto(proposal),
      type: "proposal-updated",
    });
    this.#emitSnapshot(record);
  }

  #emitSnapshot(record: SessionRecord) {
    record.events.emitSnapshot((sequence) => this.#snapshot(record, sequence));
  }

  #isExpired(record: SessionRecord) {
    const snapshot = record.controller.snapshot();
    const now = this.#runtime.now().getTime();

    return now - Date.parse(snapshot.lastActiveAt) >=
        this.#servicePolicy.idleTtlMilliseconds ||
      now - Date.parse(snapshot.createdAt) >=
        this.#servicePolicy.absoluteTtlMilliseconds;
  }

  #removeExpiredSessionsWithoutWaiting() {
    for (const [sessionId, record] of this.#sessions) {
      if (!this.#isExpired(record)) continue;
      this.#sessions.delete(sessionId);
      void this.#disposeRecord(record);
    }
  }

  async #expireSessions() {
    const expired: SessionRecord[] = [];

    for (const [sessionId, record] of this.#sessions) {
      if (!this.#isExpired(record)) continue;
      this.#sessions.delete(sessionId);
      expired.push(record);
    }
    await Promise.allSettled(expired.map((record) => this.#disposeRecord(record)));
  }

  #disposeRecord(record: SessionRecord) {
    if (record.disposePromise) return record.disposePromise;
    const execution = (async () => {
      record.abortController?.abort(new Error("Agent session ended"));
      if (record.capability) this.#ipc.revoke(record.capability);
      record.events.close();
      try {
        await this.#stopRuntimeSession(record, false);
      } finally {
        record.configurationUse.release();
      }
    })();

    record.disposePromise = execution;
    this.#sessionDisposals.add(execution);
    void execution.finally(() => this.#sessionDisposals.delete(execution))
      .catch(() => undefined);
    return execution;
  }

  #stopRuntimeSession(record: SessionRecord, cancel: boolean) {
    record.runtimeStopPromise ??= (async () => {
      if (cancel) await record.runtimeSession.cancel().catch(() => undefined);
      await record.runtimeSession.dispose();
    })();
    return record.runtimeStopPromise;
  }
}
