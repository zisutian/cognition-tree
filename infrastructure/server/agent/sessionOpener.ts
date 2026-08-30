// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentRuntimeInstructions,
  AgentSessionController,
  type AgentRuntimeToolCall,
  type AgentScope,
} from "../../../application/agent/index.ts";
import type {
  AgentCreateSessionRequestDto,
  AgentSessionSnapshotDto,
} from "../../../contracts/agent/schemas.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import type { OperationLedger } from "../operations/operationLedger.ts";
import type { AgentConfigurationProfileUse } from "./configurationAccess.ts";
import type { AgentConfigurationStore } from "./configurationStore.ts";
import { AgentServiceError } from "./errors.ts";
import type { AgentPrivateIpcServer } from "./privateIpc.ts";
import type { AgentRuntimeFactory } from "./configuredAgentRuntimeFactory.ts";
import { createAgentRuntimeProfile } from "./runtimeProfiles.ts";
import { AgentSessionEventStream } from "./sessionEventStream.ts";
import type { AgentSessionRecord } from "./sessionRecord.ts";
import type { AgentServicePolicy } from "./servicePolicy.ts";
import type { AgentSessionTools } from "./sessionTools.ts";
import { agentRuntimeToolsForScope } from "./sessionToolProtocol.ts";

type AgentSessionResidency = {
  disposeRecord(record: AgentSessionRecord): Promise<void>;
  pruneExpired(): void;
  publish(record: AgentSessionRecord): void;
  reserveProfile(profile: AgentSessionRecord["profile"]): { release(): void };
  unpublish(record: AgentSessionRecord): boolean;
};

function sessionMcpEntrypoint() {
  const current = fileURLToPath(import.meta.url);
  const extension = path.extname(current);

  return path.join(path.dirname(current), `sessionMcpServer${extension}`);
}

export class AgentSessionOpener {
  readonly #assertOpen: () => void;
  readonly #configurationStore: AgentConfigurationStore;
  readonly #createSnapshot: (
    record: AgentSessionRecord,
  ) => AgentSessionSnapshotDto;
  readonly #emitSnapshot: (record: AgentSessionRecord) => void;
  readonly #executeTool: (
    sessionId: string,
    call: AgentRuntimeToolCall,
  ) => Promise<unknown>;
  readonly #ipc: AgentPrivateIpcServer;
  readonly #ledger: OperationLedger | null;
  readonly #residency: AgentSessionResidency;
  readonly #runtime: ApiRuntime;
  readonly #runtimeFactory: AgentRuntimeFactory;
  readonly #servicePolicy: AgentServicePolicy;
  readonly #tools: AgentSessionTools;

  constructor({
    assertOpen,
    configurationStore,
    createSnapshot,
    emitSnapshot,
    executeTool,
    ipc,
    ledger,
    residency,
    runtime,
    runtimeFactory,
    servicePolicy,
    tools,
  }: {
    assertOpen: () => void;
    configurationStore: AgentConfigurationStore;
    createSnapshot: (
      record: AgentSessionRecord,
    ) => AgentSessionSnapshotDto;
    emitSnapshot: (record: AgentSessionRecord) => void;
    executeTool: (
      sessionId: string,
      call: AgentRuntimeToolCall,
    ) => Promise<unknown>;
    ipc: AgentPrivateIpcServer;
    ledger: OperationLedger | null;
    residency: AgentSessionResidency;
    runtime: ApiRuntime;
    runtimeFactory: AgentRuntimeFactory;
    servicePolicy: AgentServicePolicy;
    tools: AgentSessionTools;
  }) {
    this.#assertOpen = assertOpen;
    this.#configurationStore = configurationStore;
    this.#createSnapshot = createSnapshot;
    this.#emitSnapshot = emitSnapshot;
    this.#executeTool = executeTool;
    this.#ipc = ipc;
    this.#ledger = ledger;
    this.#residency = residency;
    this.#runtime = runtime;
    this.#runtimeFactory = runtimeFactory;
    this.#servicePolicy = servicePolicy;
    this.#tools = tools;
  }

  async open(request: AgentCreateSessionRequestDto) {
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
    this.#residency.pruneExpired();
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
    const capacity = this.#residency.reserveProfile(profile);

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
        this.#residency.publish(record);
        this.#emitSnapshot(record);
        return this.#createSnapshot(record);
      } catch (error) {
        if (record) this.#residency.unpublish(record);
        if (record) {
          await this.#residency.disposeRecord(record);
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

  async #createPrivateToolProcess(sessionId: string, scope: AgentScope) {
    const endpoint = await this.#ipc.start();
    await this.#tools.assertScopeAvailable(scope);
    const tools = agentRuntimeToolsForScope(scope);
    const expiresAt = Date.parse(readApiRuntimeNow(this.#runtime).timestamp) +
      this.#servicePolicy.absoluteTtlMilliseconds;
    const capability = this.#ipc.register({
      expiresAt,
      handle: (request) => this.#executeTool(sessionId, {
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
}
