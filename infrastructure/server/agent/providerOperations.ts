// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { CodexDeviceLoginOperations } from "./codexDeviceLoginOperations.ts";
import { AgentConformanceOperations } from "./conformanceOperations.ts";
import type { AgentConfigurationStore } from "./configurationStore.ts";
import { AgentProviderOperationConflictError } from "./providerOperationErrors.ts";
import { AgentProviderProbeService } from "./providerProbe.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";

const defaultCodexDeviceLoginTtlMilliseconds = 15 * 60 * 1_000;

export class AgentProviderOperations {
  readonly #codexDeviceLogins: CodexDeviceLoginOperations;
  readonly #conformance: AgentConformanceOperations;
  readonly #probe: AgentProviderProbeService;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor({
    configurationStore,
    codexDeviceLoginTtlMilliseconds = defaultCodexDeviceLoginTtlMilliseconds,
    fetch: fetchFn = globalThis.fetch.bind(globalThis),
    projectRoot = process.cwd(),
    runtime,
    targetPolicy = new AgentProviderTargetPolicy(),
  }: {
    configurationStore: AgentConfigurationStore;
    codexDeviceLoginTtlMilliseconds?: number;
    fetch?: typeof fetch;
    projectRoot?: string;
    runtime: ApiRuntime;
    targetPolicy?: AgentProviderTargetPolicy;
  }) {
    const resolvedProjectRoot = path.resolve(projectRoot);

    this.#codexDeviceLogins = new CodexDeviceLoginOperations({
      configurationStore,
      projectRoot: resolvedProjectRoot,
      runtime,
      ttlMilliseconds: codexDeviceLoginTtlMilliseconds,
    });
    this.#conformance = new AgentConformanceOperations({
      configurationStore,
      projectRoot: resolvedProjectRoot,
      runtime,
      targetPolicy,
    });
    this.#probe = new AgentProviderProbeService({
      configurationStore,
      fetch: fetchFn,
      runtime,
      targetPolicy,
    });
  }

  async discoverOllama(endpointValue: string) {
    this.#assertOpen();
    return this.#probe.discoverOllama(endpointValue);
  }

  async probe(providerId: string) {
    this.#assertOpen();
    return this.#probe.probe(providerId);
  }

  async startCodexDeviceLogin(baseRevision: string, providerId: string) {
    this.#assertOpen();
    return this.#codexDeviceLogins.start(baseRevision, providerId);
  }

  getCodexDeviceLogin(loginId: string) {
    return this.#codexDeviceLogins.get(loginId);
  }

  cancelCodexDeviceLogin(loginId: string) {
    return this.#codexDeviceLogins.cancel(loginId);
  }

  hasActiveOperations() {
    return this.#codexDeviceLogins.hasPending() || this.#conformance.hasActiveOperations();
  }

  hasPendingCodexLogin(providerId?: string) {
    return this.#codexDeviceLogins.hasPending(providerId);
  }

  async startConformance(baseRevision: string, profileId: string) {
    this.#assertOpen();
    return this.#conformance.start(baseRevision, profileId);
  }

  getConformance(checkId: string) {
    return this.#conformance.get(checkId);
  }

  cancelConformance(checkId: string) {
    return this.#conformance.cancel(checkId);
  }

  dispose() {
    this.#disposed = true;
    this.#disposePromise ??= Promise.all([
      this.#codexDeviceLogins.dispose(),
      this.#conformance.dispose(),
    ]).then(() => undefined);
    return this.#disposePromise;
  }

  #assertOpen() {
    if (this.#disposed) {
      throw new AgentProviderOperationConflictError(
        "Agent provider operations are closing",
      );
    }
  }
}
