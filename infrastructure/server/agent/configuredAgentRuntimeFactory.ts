// SPDX-License-Identifier: GPL-3.0-or-later

import type { ConfiguredAgentRuntimeInput, AgentRuntimeFactory } from '../../../application/agentHost/runtimePorts.ts';
import path from "node:path";
import type { AgentRuntimePort } from "../../../application/agent/agentRuntimePort.ts";
import { CodexRuntime } from "./codexRuntime.ts";
import { OllamaRuntime } from "./ollamaRuntime.ts";
import { OpenAiChatRuntime } from "./openAiChatRuntime.ts";
import {
  AgentProviderTargetPolicy,
} from "./providerTargetPolicy.ts";

type AgentProviderRequestTargetPolicy = Pick<
  AgentProviderTargetPolicy,
  "assertRequestTarget"
>;

export class ConfiguredAgentRuntimeFactory implements AgentRuntimeFactory {
  readonly #projectRoot: string;
  readonly #targetPolicy: AgentProviderRequestTargetPolicy;

  constructor({
    projectRoot = process.cwd(),
    targetPolicy = new AgentProviderTargetPolicy(),
  }: {
    projectRoot?: string;
    targetPolicy?: AgentProviderRequestTargetPolicy;
  } = {}) {
    this.#projectRoot = path.resolve(projectRoot);
    this.#targetPolicy = targetPolicy;
  }

  create({
    configuration,
    openAiAuthentication = "require-api-key",
    profile,
  }: ConfiguredAgentRuntimeInput): AgentRuntimePort {
    if (profile.id !== configuration.profile.id) {
      throw new Error("Agent runtime profile does not match its configuration");
    }
    if (profile.kind !== configuration.provider.kind) {
      throw new Error("Agent runtime profile does not match its provider");
    }
    const beforeRequest = async () => {
      const baseUrl = configuration.provider.baseUrl;

      if (baseUrl === null) return;
      await this.#targetPolicy.assertRequestTarget(
        new URL(baseUrl),
        configuration.privateNetworkOrigin,
      );
    };

    if (profile.kind === "ollama") {
      return new OllamaRuntime(profile, beforeRequest);
    }
    if (profile.kind === "codex") {
      const authentication = configuration.provider.authenticationType ===
          "chatgpt-device-code"
        ? configuration.codexHome
          ? {
              codexHome: configuration.codexHome,
              type: "chatgpt-device-code" as const,
            }
          : null
        : configuration.apiKey
          ? { apiKey: configuration.apiKey, type: "api-key" as const }
          : null;

      if (!authentication) {
        throw new Error("Agent provider credential is unavailable");
      }
      return new CodexRuntime({
        authentication,
        profile,
        projectRoot: this.#projectRoot,
      });
    }
    if (!configuration.apiKey && openAiAuthentication === "require-api-key") {
      throw new Error("Agent provider credential is unavailable");
    }
    return new OpenAiChatRuntime(
      profile,
      configuration.apiKey ?? "",
      beforeRequest,
    );
  }
}
