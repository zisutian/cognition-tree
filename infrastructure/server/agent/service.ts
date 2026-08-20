// SPDX-License-Identifier: GPL-3.0-or-later

import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  commitAgentProposalExactly,
  confirmAgentProposalDestruction,
  decideAgentProposal,
  markAgentProposalFailed,
  markAgentProposalStale,
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
} from "../../../application/agent/index.ts";
import type {
  AgentCreateSessionRequestDto,
  AgentEventDto,
  AgentOperationAuditEntryDto,
  AgentProfileSummaryDto,
  AgentSessionSnapshotDto,
  AgentStatusDto,
} from "../../../contracts/agent/schemas.ts";
import { AgentSessionSnapshotSchema } from "../../../contracts/agent/schemas.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";
import type { WorkspaceRepositoryStore } from "../repository/store.ts";
import { WorkspaceRevisionConflictError } from "../repository/store.ts";
import type { VersionedContentStore } from "../repository/versioned/contentStore.ts";
import { VersionedContentRevisionConflictError } from "../repository/versioned/contentStore.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import type { ApiSearchService } from "../api/search.ts";
import { ApiEventHub } from "../api/sync/events.ts";
import { ApiRevisionTracker } from "../api/sync/revisionTracker.ts";
import { AgentPrivateIpcServer } from "./privateIpc.ts";
import { CodexRuntime } from "./codexRuntime.ts";
import {
  AgentContextLimitError,
  OpenAiChatRuntime,
} from "./openAiChatRuntime.ts";
import type {
  AgentProfile,
  AgentProfileCatalog,
  LoadedAgentProfile,
} from "./profiles.ts";
import type { AgentOperationLedger } from "./operationLedger.ts";
import { AgentServiceError } from "./errors.ts";
import {
  AgentSessionTools,
  agentRuntimeTools,
  toAgentProposalDto,
  type AgentStaging,
} from "./sessionTools.ts";

export { AgentServiceError } from "./errors.ts";
export type { AgentServiceErrorCode } from "./errors.ts";

type AgentEventWithoutSequence =
  | Omit<Extract<AgentEventDto, { type: "message-delta" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentEventDto, { type: "problem" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentEventDto, { type: "proposal-updated" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentEventDto, { type: "session-snapshot" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentEventDto, { type: "turn-completed" }>, "sequence" | "sessionId">;

type SessionRecord = {
  abortController: AbortController | null;
  capability: string | null;
  controller: AgentSessionController;
  eventSequence: number;
  events: AgentEventDto[];
  eventStreams: Set<ServerResponse>;
  profile: AgentProfile;
  runtime: AgentRuntimePort;
  runtimeSession: AgentRuntimeSession;
  staging: AgentStaging | null;
};

type RuntimeFactory = (
  profile: AgentProfile,
  apiKey: string,
) => AgentRuntimePort;

const maximumRetainedEvents = 1_000;

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function writeAgentEvent(response: ServerResponse, event: AgentEventDto) {
  response.write(
    `event: ${event.type}\nid: ${event.sequence}\ndata: ${
      serializeJsonIteratively(event, { sortObjectKeys: true })
    }\n\n`,
  );
}

function isAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted ||
    (error instanceof Error && error.name === "AbortError");
}

function sessionMcpEntrypoint() {
  const current = fileURLToPath(import.meta.url);
  const extension = path.extname(current);

  return path.join(path.dirname(current), `sessionMcpServer${extension}`);
}

function mapProfile(profile: LoadedAgentProfile): AgentProfileSummaryDto {
  return {
    availability: profile.availability,
    id: profile.id,
    kind: profile.kind,
    label: profile.label,
    unavailableReason: profile.unavailableReason,
  };
}

export class AgentService {
  readonly #builtInCatalog: ApiBuiltInCatalog;
  readonly #catalog: WorkspaceRepositoryCatalog;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #eventHub: ApiEventHub;
  readonly #ipc: AgentPrivateIpcServer;
  readonly #ledger: AgentOperationLedger | null;
  readonly #profileCatalog: AgentProfileCatalog;
  readonly #profileQueues = new Map<string, Promise<void>>();
  readonly #projectRoot: string;
  readonly #revisionTracker: ApiRevisionTracker;
  readonly #runtime: ApiRuntime;
  readonly #runtimeFactory: RuntimeFactory;
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #sweeper: NodeJS.Timeout;
  readonly #tools: AgentSessionTools;

  constructor({
    builtInCatalog,
    catalog,
    environment = process.env,
    eventHub,
    ipc = new AgentPrivateIpcServer(),
    ledger,
    profileCatalog,
    projectRoot = process.cwd(),
    revisionTracker,
    runtime,
    runtimeFactory,
    search,
  }: {
    builtInCatalog: ApiBuiltInCatalog;
    catalog: WorkspaceRepositoryCatalog;
    environment?: NodeJS.ProcessEnv;
    eventHub: ApiEventHub;
    ipc?: AgentPrivateIpcServer;
    ledger: AgentOperationLedger | null;
    profileCatalog: AgentProfileCatalog;
    projectRoot?: string;
    revisionTracker: ApiRevisionTracker;
    runtime: ApiRuntime;
    runtimeFactory?: RuntimeFactory;
    search: ApiSearchService;
  }) {
    this.#builtInCatalog = builtInCatalog;
    this.#catalog = catalog;
    this.#environment = environment;
    this.#eventHub = eventHub;
    this.#ipc = ipc;
    this.#ledger = ledger;
    this.#profileCatalog = profileCatalog;
    this.#projectRoot = path.resolve(projectRoot);
    this.#revisionTracker = revisionTracker;
    this.#runtime = runtime;
    this.#runtimeFactory = runtimeFactory ?? ((profile, apiKey) =>
      profile.kind === "codex"
        ? new CodexRuntime({ apiKey, profile, projectRoot: this.#projectRoot })
        : new OpenAiChatRuntime(profile, apiKey));
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

  status(): AgentStatusDto {
    return {
      configurationProblem: this.#profileCatalog.configurationProblem,
      enabled: this.#ledger !== null &&
        this.#profileCatalog.profiles.some(({ availability }) =>
          availability === "available"
        ),
      profiles: this.#profileCatalog.profiles.map(mapProfile),
    };
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

  async createSession(request: AgentCreateSessionRequestDto) {
    this.#removeExpiredSessionsWithoutWaiting();
    if (!this.#ledger) {
      throw new AgentServiceError(
        "profile_unavailable",
        this.#profileCatalog.configurationProblem ??
          "Agent operation ledger is unavailable",
      );
    }
    const loaded = this.#profileCatalog.profiles.find(({ id }) =>
      id === request.profileId
    );

    if (!loaded || loaded.availability !== "available" || !loaded.config) {
      throw new AgentServiceError(
        "profile_unavailable",
        loaded?.unavailableReason ?? "Agent profile is unavailable",
      );
    }
    const resident = [...this.#sessions.values()].filter(({ profile }) =>
      profile.id === loaded.id
    ).length;

    if (resident >= loaded.config.maxResidentSessions) {
      throw new AgentServiceError(
        "session_capacity_reached",
        "Agent profile has reached maxResidentSessions",
      );
    }
    const scope = request.scope as AgentScope;

    await this.#tools.assertScopeAvailable(scope);
    const sessionId = this.#runtime.createId();
    const profile = loaded.config;
    const apiKey = this.#environment[profile.apiKeyEnv];

    if (!apiKey) {
      throw new AgentServiceError(
        "profile_unavailable",
        `Environment variable ${profile.apiKeyEnv} is not set`,
      );
    }
    const controller = new AgentSessionController({
      id: sessionId,
      profileId: profile.id,
      runtime: {
        createId: () => this.#runtime.createId(),
        now: () => readApiRuntimeNow(this.#runtime).timestamp,
      },
      scope,
    });
    const runtimePort = this.#runtimeFactory(profile, apiKey);
    let capability: string | null = null;

    try {
      const privateToolProcess = profile.kind === "codex"
        ? await this.#createPrivateToolProcess(sessionId, scope)
        : undefined;

      capability = privateToolProcess?.capability ?? null;
      const runtimeSession = await runtimePort.openSession({
        ...(privateToolProcess
          ? { privateToolProcess: privateToolProcess.process }
          : {}),
        profileId: profile.id,
        scope,
        sessionId,
      });
      const record: SessionRecord = {
        abortController: null,
        capability,
        controller,
        eventSequence: 0,
        events: [],
        eventStreams: new Set(),
        profile,
        runtime: runtimePort,
        runtimeSession,
        staging: null,
      };

      this.#sessions.set(sessionId, record);
      this.#emitSnapshot(record);
      return this.#snapshot(record);
    } catch (error) {
      if (capability) this.#ipc.revoke(capability);
      throw error;
    }
  }

  async deleteSession(sessionId: string) {
    const record = this.#requireSession(sessionId);

    this.#sessions.delete(sessionId);
    await this.#disposeRecord(record);
    return { deleted: true as const };
  }

  sendMessage(sessionId: string, content: string) {
    const record = this.#requireSession(sessionId);
    const turnId = this.#runtime.createId();
    const queued = this.#profileQueues.has(record.profile.id);

    record.controller.beginTurn(turnId, queued);
    record.controller.addMessage("user", content);
    record.controller.clearProblem();
    record.abortController = new AbortController();
    this.#emitSnapshot(record);
    this.#enqueue(record, () => this.#runConversationTurn(record, turnId));
    return { accepted: true as const, turnId };
  }

  async cancel(sessionId: string) {
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
    await record.runtimeSession.cancel().catch(() => undefined);
    await record.runtimeSession.dispose();
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

    response.writeHead(200, {
      ...headers,
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const firstRetained = record.events[0]?.sequence ?? record.eventSequence;

    if (afterSequence < firstRetained - 1 || afterSequence > record.eventSequence) {
      writeAgentEvent(response, {
        sequence: record.eventSequence,
        sessionId,
        snapshot: this.#snapshot(record),
        type: "session-snapshot",
      });
    } else {
      for (const event of record.events) {
        if (event.sequence > afterSequence) writeAgentEvent(response, event);
      }
    }
    record.eventStreams.add(response);
    response.once("close", () => record.eventStreams.delete(response));
  }

  async decideProposal({
    decision,
    ownerId,
    proposalId,
    sessionId,
  }: {
    decision: "approve" | "reject";
    ownerId: string;
    proposalId: string;
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
    return this.#commit(record, proposal, ownerId);
  }

  async confirmDestruction({
    ownerId,
    proposalId,
    sessionId,
  }: {
    ownerId: string;
    proposalId: string;
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
    return this.#commit(record, proposal, ownerId);
  }

  async dispose() {
    clearInterval(this.#sweeper);
    const records = [...this.#sessions.values()];

    this.#sessions.clear();
    await Promise.allSettled(records.map((record) => this.#disposeRecord(record)));
    await this.#ipc.dispose();
  }

  #snapshot(
    record: SessionRecord,
    sequence = record.eventSequence,
  ): AgentSessionSnapshotDto {
    const snapshot = record.controller.snapshot();

    return parseAgentSchema(AgentSessionSnapshotSchema, {
      ...snapshot,
      proposals: snapshot.proposals.map((proposal) => ({
        baseRevision: proposal.baseRevision,
        changes: proposal.changes,
        destructive: proposal.destructive,
        digest: proposal.digest,
        diff: proposal.diff,
        id: proposal.id,
        status: proposal.status,
        store: proposal.store,
        version: proposal.version,
      })),
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
    const expiresAt = Date.parse(readApiRuntimeNow(this.#runtime).timestamp) +
      this.#profileCatalog.absoluteTtlMilliseconds;
    const capability = this.#ipc.register({
      expiresAt,
      handle: (request) => this.#executeTool(this.#requireSession(sessionId), {
        arguments: request.tool.input,
        callId: request.id,
        name: request.tool.name,
      }),
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

  #enqueue(record: SessionRecord, task: () => Promise<void>) {
    const profileId = record.profile.id;
    const previous = this.#profileQueues.get(profileId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    const tracked = current.finally(() => {
      if (this.#profileQueues.get(profileId) === tracked) {
        this.#profileQueues.delete(profileId);
      }
    });

    this.#profileQueues.set(profileId, tracked);
    void tracked.catch(() => undefined);
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
      await this.#tools.assertScopeAvailable(controller.snapshot().scope);
      await this.#runRuntimeWithCompaction(record, messageId, signal, agentRuntimeTools);
      controller.finishTurn(turnId);
      record.abortController = null;
      this.#emit(record, { status: "completed", turnId, type: "turn-completed" });
      this.#emitSnapshot(record);
    } catch (error) {
      record.abortController = null;
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
      this.#emit(record, { code: "agent_turn_failed", message, type: "problem" });
      this.#emit(record, { status: "failed", turnId, type: "turn-completed" });
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
              this.#emit(record, {
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
          this.#emit(record, {
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
          "Configured context window reached",
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
    this.#emit(record, { status: "cancelled", turnId, type: "turn-completed" });
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

  async #commit(record: SessionRecord, proposal: AgentProposal, ownerId: string) {
    const ledger = this.#ledger;

    if (!ledger) {
      throw new AgentServiceError("profile_unavailable", "Agent ledger is unavailable");
    }
    const identity = {
      digest: proposal.digest,
      proposalId: proposal.id,
      proposalVersion: proposal.version,
    };
    const result = await ledger.runIdempotent(identity, async () => {
      let afterRevision: `sha256:${string}` | null = null;
      let result: AgentOperationAuditEntryDto["result"] = "failed";

      try {
        const store = await this.#proposalStore(proposal);
        const committed = await commitAgentProposalExactly({
          proposal,
          store,
        });

        afterRevision = committed.receipt.revision;
        result = "committed";
        proposal = committed.proposal;
        this.#publishCommittedProposal(proposal, afterRevision);
      } catch (error) {
        if (
          error instanceof WorkspaceRevisionConflictError ||
          error instanceof VersionedContentRevisionConflictError
        ) {
          afterRevision = error.currentRevision;
          result = "stale";
          proposal = markAgentProposalStale(proposal);
        } else {
          proposal = markAgentProposalFailed(proposal);
        }
      }
      return this.#auditEntry(record, proposal, ownerId, afterRevision, result);
    });

    if (result.entry.result === "committed") {
      if (proposal.status !== "committed") {
        proposal = { ...proposal, status: "committed" };
      }
      record.controller.putProposal(proposal);
      this.#emitProposal(record, proposal);
      if (!result.replayed) this.#scheduleReceiptSummary(record, result.entry);
      return toAgentProposalDto(proposal);
    }
    proposal = result.entry.result === "stale"
      ? markAgentProposalStale(proposal)
      : markAgentProposalFailed(proposal);
    record.controller.putProposal(proposal);
    this.#emitProposal(record, proposal);
    if (result.entry.result === "stale") {
      throw new AgentServiceError(
        "proposal_stale",
        "Store revision changed after the proposal was staged",
      );
    }
    throw new AgentServiceError("session_unavailable", "Agent commit failed");
  }

  async #proposalStore(proposal: AgentProposal) {
    if (proposal.store.domain === "workspace") {
      return await this.#catalog.getStore(proposal.store.repositoryId) as WorkspaceRepositoryStore;
    }
    return await this.#builtInCatalog.getStore(proposal.store.domain) as
      VersionedContentStore<unknown, unknown>;
  }

  #auditEntry(
    record: SessionRecord,
    proposal: AgentProposal,
    ownerId: string,
    afterRevision: `sha256:${string}` | null,
    result: AgentOperationAuditEntryDto["result"],
  ): AgentOperationAuditEntryDto {
    return {
      afterRevision,
      approvingOwnerId: ownerId,
      beforeRevision: proposal.base.revision,
      changeMetadata: {
        blockIds: unique(proposal.changes.blocks.map(({ blockId }) => blockId)),
        resourceIds: unique(
          proposal.changes.resources.map(({ resourceId }) => resourceId),
        ),
      },
      digest: proposal.digest,
      occurredAt: readApiRuntimeNow(this.#runtime).timestamp,
      profileId: record.profile.id,
      proposalId: proposal.id,
      proposalVersion: proposal.version,
      result,
      runtimeKind: record.runtime.kind,
      sessionId: record.controller.snapshot().id,
      store: proposal.store,
    };
  }

  #publishCommittedProposal(
    proposal: AgentProposal,
    revision: `sha256:${string}`,
  ) {
    if (proposal.store.domain === "workspace") {
      this.#revisionTracker.observeWorkspace(proposal.store.repositoryId, revision);
    } else {
      this.#revisionTracker.observeDomain(proposal.store.domain, revision);
    }
    const checkpoint = this.#revisionTracker.checkpoint({
      sequence: this.#eventHub.sequence,
      streamId: this.#eventHub.streamId,
    });

    this.#eventHub.publish(checkpoint, proposal.changes);
  }

  #scheduleReceiptSummary(
    record: SessionRecord,
    receipt: AgentOperationAuditEntryDto,
  ) {
    if (record.controller.snapshot().activeTurnId) return;
    const turnId = this.#runtime.createId();
    const queued = this.#profileQueues.has(record.profile.id);
    const controller = new AbortController();

    record.controller.beginTurn(turnId, queued);
    record.abortController = controller;
    this.#emitSnapshot(record);
    this.#enqueue(record, async () => {
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
            this.#emit(record, {
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
          this.#emit(record, {
            messageId,
            textDelta: result.finalText,
            type: "message-delta",
          });
        }
        record.controller.finishTurn(turnId);
        record.abortController = null;
        this.#emit(record, { status: "completed", turnId, type: "turn-completed" });
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
        this.#emit(record, {
          code: "receipt_summary_failed",
          message,
          type: "problem",
        });
        this.#emit(record, { status: "failed", turnId, type: "turn-completed" });
        this.#emitSnapshot(record);
      }
    });
  }

  #emitProposal(record: SessionRecord, proposal: AgentProposal) {
    this.#emit(record, { proposal: toAgentProposalDto(proposal), type: "proposal-updated" });
    this.#emitSnapshot(record);
  }

  #emitSnapshot(record: SessionRecord) {
    this.#emit(record, {
      snapshot: this.#snapshot(record, record.eventSequence + 1),
      type: "session-snapshot",
    });
  }

  #emit(record: SessionRecord, value: AgentEventWithoutSequence) {
    record.eventSequence += 1;
    const event = {
      ...value,
      sequence: record.eventSequence,
      sessionId: record.controller.snapshot().id,
    } as AgentEventDto;

    record.events.push(event);
    if (record.events.length > maximumRetainedEvents) {
      record.events.splice(0, record.events.length - maximumRetainedEvents);
    }
    for (const response of record.eventStreams) writeAgentEvent(response, event);
  }

  #isExpired(record: SessionRecord) {
    const snapshot = record.controller.snapshot();
    const now = this.#runtime.now().getTime();

    return now - Date.parse(snapshot.lastActiveAt) >=
        this.#profileCatalog.idleTtlMilliseconds ||
      now - Date.parse(snapshot.createdAt) >=
        this.#profileCatalog.absoluteTtlMilliseconds;
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

  async #disposeRecord(record: SessionRecord) {
    record.abortController?.abort(new Error("Agent session ended"));
    if (record.capability) this.#ipc.revoke(record.capability);
    for (const response of record.eventStreams) response.end();
    record.eventStreams.clear();
    await record.runtimeSession.dispose();
  }
}
