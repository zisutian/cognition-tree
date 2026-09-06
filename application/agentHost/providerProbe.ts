// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentProviderProbe } from "../agent/index.ts";
import { readCommandRuntimeNow, type CommandRuntime } from "../commands/index.ts";
import type { AgentConfigurationPort, ResolvedAgentProvider } from "./configurationPort.ts";
import { AgentConfigurationValidationError } from "./configurationErrors.ts";
import type { AgentProviderProbePort } from "./providerOperationPorts.ts";

export type AgentProviderProbeTransportPort = Pick<AgentProviderProbePort, "discoverOllama"> & {
  probe(provider: ResolvedAgentProvider, configuredModels: readonly string[]): Promise<Omit<AgentProviderProbe, "probedAt" | "reachable">>;
};

type ProbeConfigurationPort = Pick<AgentConfigurationPort, "readSnapshot"> & {
  resolveProvider(providerId: string): Promise<ResolvedAgentProvider | null>;
};

type ProbeServicePorts = {
    configuration: ProbeConfigurationPort;
    transport: AgentProviderProbeTransportPort;
    runtime: CommandRuntime;
};

export class AgentProviderProbeService implements AgentProviderProbePort {
  readonly #ports: ProbeServicePorts;
  constructor(ports: ProbeServicePorts) { this.#ports = ports; }

  discoverOllama(endpoint: string) { return this.#ports.transport.discoverOllama(endpoint); }

  async probe(providerId: string): Promise<AgentProviderProbe> {
    const resolved = await this.#ports.configuration.resolveProvider(providerId);
    if (!resolved) throw new AgentConfigurationValidationError("Agent provider does not exist");
    if (resolved.provider.kind === "codex") {
      return {
        modelContexts: [], models: [],
        probedAt: readCommandRuntimeNow(this.#ports.runtime).timestamp,
        reachable: resolved.provider.authenticationStatus === "configured",
      };
    }
    const configuredModels = resolved.provider.kind === "ollama"
      ? [...new Set((await this.#ports.configuration.readSnapshot()).profiles
          .filter(profile => profile.providerId === providerId)
          .map(profile => profile.model))].sort()
      : [];
    return {
      ...await this.#ports.transport.probe(resolved, configuredModels),
      probedAt: readCommandRuntimeNow(this.#ports.runtime).timestamp,
      reachable: true,
    };
  }
}
