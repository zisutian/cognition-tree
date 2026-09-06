// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentDeviceLoginPort, AgentConformancePort, AgentProviderProbePort } from './providerOperationPorts.ts';
import { AgentProviderOperationConflictError } from './providerOperationErrors.ts';

export class AgentProviderOperations {
  readonly #codexDeviceLogins: AgentDeviceLoginPort;
  readonly #conformance: AgentConformancePort;
  readonly #probe: AgentProviderProbePort;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor({codexDeviceLogins, conformance, probe}: {
    codexDeviceLogins: AgentDeviceLoginPort;
    conformance: AgentConformancePort;
    probe: AgentProviderProbePort;
  }) {
    this.#codexDeviceLogins = codexDeviceLogins;
    this.#conformance = conformance;
    this.#probe = probe;
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
