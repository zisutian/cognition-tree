// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createAgentRuntimeInstructions,
  AgentSessionController,
  type AgentRuntimeToolCall,
  type AgentScope,
} from "../agent/index.ts";
import type { AgentSessionSnapshot } from "../agent/index.ts";
import type {
  AgentHostRuntime,
  AgentAuditAvailabilityPort,
  AgentPrivateToolsPort,
  AgentRuntimeFactory,
  AgentHostTools,
  AgentToolProtocolPort,
} from "./runtimePorts.ts";
import { readAgentHostTimestamp } from "./runtimePorts.ts";

import type { AgentConfigurationProfileUse } from "./configurationAccess.ts";
import type { AgentConfigurationPort } from "./configurationPort.ts";
import { AgentServiceError } from "./errors.ts";


import { createAgentRuntimeProfile } from "./runtimeProfiles.ts";
import { AgentSessionEventStream } from "./sessionEventStream.ts";
import type { AgentSessionRecord } from "./sessionRecord.ts";
import type { AgentServicePolicy } from "./servicePolicy.ts";



type AgentSessionResidency = {
  disposeRecord(record: AgentSessionRecord): Promise<void>;
  pruneExpired(): void;
  publish(record: AgentSessionRecord): void;
  reserveProfile(profile: AgentSessionRecord["profile"]): { release(): void };
  unpublish(record: AgentSessionRecord): boolean;
};


export class AgentSessionOpener {
  readonly #assertOpen: () => void;
  readonly #configurationStore: AgentConfigurationPort;
  readonly #createSnapshot: (
    record: AgentSessionRecord,
  ) => AgentSessionSnapshot;
  readonly #emitSnapshot: (record: AgentSessionRecord) => void;
  readonly #executeTool: (
    sessionId: string,
    call: AgentRuntimeToolCall,
  ) => Promise<unknown>;
  readonly #ipc: AgentPrivateToolsPort;
  readonly #ledger: AgentAuditAvailabilityPort | null;
  readonly #residency: AgentSessionResidency;
  readonly #runtime: AgentHostRuntime;
  readonly #runtimeFactory: AgentRuntimeFactory;
  readonly #servicePolicy: AgentServicePolicy;
  readonly #protocol: AgentToolProtocolPort;
  readonly #tools: AgentHostTools;

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
    protocol,
  }: {
    assertOpen: () => void;
    configurationStore: AgentConfigurationPort;
    createSnapshot: (
      record: AgentSessionRecord,
    ) => AgentSessionSnapshot;
    emitSnapshot: (record: AgentSessionRecord) => void;
    executeTool: (
      sessionId: string,
      call: AgentRuntimeToolCall,
    ) => Promise<unknown>;
    ipc: AgentPrivateToolsPort;
    ledger: AgentAuditAvailabilityPort | null;
    residency: AgentSessionResidency;
    runtime: AgentHostRuntime;
    runtimeFactory: AgentRuntimeFactory;
    servicePolicy: AgentServicePolicy;
    tools: AgentHostTools;
    protocol: AgentToolProtocolPort;
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
    this.#protocol = protocol;
  }

  async open(request: {profileId: string; scope: AgentScope}) {
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
    request: {profileId: string; scope: AgentScope},
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
          now: () => readAgentHostTimestamp(this.#runtime),
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
    await this.#tools.assertScopeAvailable(scope);
    return this.#ipc.open({
      expiresAt: Date.parse(readAgentHostTimestamp(this.#runtime)) + this.#servicePolicy.absoluteTtlMilliseconds,
      sessionId,
      tools: this.#protocol.toolsForScope(scope),
      execute: (call) => this.#executeTool(sessionId, call),
    });
  }
}
