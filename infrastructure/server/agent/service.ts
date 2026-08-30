// SPDX-License-Identifier: GPL-3.0-or-later

import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createAgentRuntimeInstructions,
  AgentSessionController,
  type AgentProposal,
  type AgentScope,
} from "../../../application/agent/index.ts";
import type {
  AgentCreateSessionRequestDto,
  AgentProfileSummaryDto,
  AgentSessionSnapshotDto,
  AgentStatusDto,
} from "../../../contracts/agent/schemas.ts";
import { AgentSessionSnapshotSchema } from "../../../contracts/agent/schemas.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import type { ApiSearchService } from "../api/search.ts";
import type { ApiEventHub } from "../api/sync/events.ts";
import type { ApiRevisionTracker } from "../api/sync/revisionTracker.ts";
import { AgentPrivateIpcServer } from "./privateIpc.ts";
import type {
  AgentConfigurationStore,
} from "./configurationStore.ts";
import type {
  AgentConfigurationProfileUse,
} from "./configurationAccess.ts";
import type { OperationLedger } from "../operations/operationLedger.ts";
import {
  createAgentRuntimeProfile,
} from "./runtimeProfiles.ts";
import {
  ConfiguredAgentRuntimeFactory,
  type AgentRuntimeFactory,
} from "./configuredAgentRuntimeFactory.ts";
import type { AgentServicePolicy } from "./servicePolicy.ts";
import { AgentServiceError } from "./errors.ts";
import {
  AgentProposalCommitter,
} from "./proposalCommitter.ts";
import { AgentProposalWorkflow } from "./proposalWorkflow.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import { AgentConversationRunner } from "./conversationRunner.ts";
import { AgentSessionTools } from "./sessionTools.ts";
import { toAgentProposalDto } from "./proposalCodec.ts";
import { agentRuntimeToolsForScope } from "./sessionToolProtocol.ts";
import {
  AgentSessionEventStream,
} from "./sessionEventStream.ts";
import {
  AgentSessionPool,
  type AgentSessionRecord,
} from "./sessionPool.ts";

export { AgentServiceError } from "./errors.ts";
export type { AgentServiceErrorCode } from "./errors.ts";

function sessionMcpEntrypoint() {
  const current = fileURLToPath(import.meta.url);
  const extension = path.extname(current);

  return path.join(path.dirname(current), `sessionMcpServer${extension}`);
}

export class AgentService {
  readonly #configurationStore: AgentConfigurationStore;
  readonly #conversation: AgentConversationRunner<AgentSessionRecord>;
  readonly #ipc: AgentPrivateIpcServer;
  readonly #ledger: OperationLedger | null;
  readonly #operations = new Set<Promise<unknown>>();
  readonly #proposalWorkflow: AgentProposalWorkflow<AgentSessionRecord>;
  readonly #runtime: ApiRuntime;
  readonly #runtimeFactory: AgentRuntimeFactory;
  readonly #servicePolicy: AgentServicePolicy;
  readonly #sessionPool: AgentSessionPool;
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
    const proposalCommitter = new AgentProposalCommitter({
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
    this.#conversation = new AgentConversationRunner({
      createId: () => this.#runtime.createId(),
      emitProposal: (record, proposal) => this.#emitProposal(record, proposal),
      emitSnapshot: (record) => this.#emitSnapshot(record),
      tools: this.#tools,
    });
    this.#proposalWorkflow = new AgentProposalWorkflow({
      assertScopeAvailable: (record) =>
        this.#tools.assertScopeAvailable(record.controller.snapshot().scope),
      committer: proposalCommitter,
      emitProposal: (record, proposal) => this.#emitProposal(record, proposal),
      isClosing: () => this.#disposed,
      scheduleReceiptSummary: (record, receipt) =>
        this.#conversation.scheduleReceiptSummary(record, receipt),
    });
    this.#sessionPool = new AgentSessionPool({
      ipc,
      runtime,
      servicePolicy,
    });
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
    return this.#sessionPool.list()
      .map((record) => this.#snapshot(record))
      .sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt));
  }

  getSession(sessionId: string) {
    const record = this.#sessionPool.require(sessionId);

    return this.#snapshot(record);
  }

  hasResidentSessions() {
    return this.#sessionPool.hasResidentSessions();
  }

  async createSession(request: AgentCreateSessionRequestDto) {
    this.#assertOpen();
    const execution = this.#openSession(request);

    return await this.#sessionPool.trackStart(execution);
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
    this.#sessionPool.pruneExpired();
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
    const scope = request.scope as AgentScope;
    const profile = createAgentRuntimeProfile(configuration);
    const capacity = this.#sessionPool.reserveProfile(profile);

    try {
      await this.#tools.assertScopeAvailable(scope);
      this.#assertOpen();
      const sessionId = this.#runtime.createId();
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
      let record: AgentSessionRecord | null = null;
      let runtimeSession: AgentSessionRecord["runtimeSession"] | null = null;

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
        this.#sessionPool.publish(record);
        this.#emitSnapshot(record);
        return this.#snapshot(record);
      } catch (error) {
        if (record) this.#sessionPool.unpublish(record);
        if (record) {
          await this.#sessionPool.disposeRecord(record);
        } else {
          if (capability) this.#ipc.revoke(capability);
          if (runtimeSession) await runtimeSession.dispose();
        }
        throw error;
      }
    } finally {
      capacity.release();
    }
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
    headers,
    response,
    sessionId,
  }: {
    afterSequence: number;
    headers: OutgoingHttpHeaders;
    response: ServerResponse;
    sessionId: string;
  }) {
    const record = this.#sessionPool.require(sessionId);

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

  async #createPrivateToolProcess(sessionId: string, scope: AgentScope) {
    const endpoint = await this.#ipc.start();
    await this.#tools.assertScopeAvailable(scope);
    const tools = agentRuntimeToolsForScope(scope);
    const expiresAt = Date.parse(readApiRuntimeNow(this.#runtime).timestamp) +
      this.#servicePolicy.absoluteTtlMilliseconds;
    const capability = this.#ipc.register({
      expiresAt,
      handle: (request) => this.#conversation.executeTool(
        this.#sessionPool.require(sessionId),
        {
          arguments: request.tool.input,
          callId: request.id,
          name: request.tool.name,
        },
      ),
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

  #emitProposal(record: AgentSessionRecord, proposal: AgentProposal) {
    record.events.emit({
      proposal: toAgentProposalDto(proposal),
      type: "proposal-updated",
    });
    this.#emitSnapshot(record);
  }

  #emitSnapshot(record: AgentSessionRecord) {
    record.events.emitSnapshot((sequence) => this.#snapshot(record, sequence));
  }
}
