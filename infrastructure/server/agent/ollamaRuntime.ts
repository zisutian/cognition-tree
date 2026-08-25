// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentRuntimePort } from "../../../application/agent/agentRuntimePort.ts";
import type { AgentScope } from "../../../application/agent/agentTypes.ts";
import { OpenAiCompatibleRuntimeSession } from "./openAiChatRuntime.ts";
import type { OllamaAgentProfile } from "./runtimeProfiles.ts";

export class OllamaRuntime implements AgentRuntimePort {
  readonly kind = "ollama" as const;
  readonly #beforeRequest: () => Promise<void>;
  readonly #profile: OllamaAgentProfile;

  constructor(
    profile: OllamaAgentProfile,
    beforeRequest: () => Promise<void> = async () => undefined,
  ) {
    this.#profile = profile;
    this.#beforeRequest = beforeRequest;
  }

  async openSession(input: {
    instructions: string;
    privateToolProcess?: unknown;
    profileId: string;
    scope: AgentScope;
    sessionId: string;
  }) {
    return new OpenAiCompatibleRuntimeSession(
      this.#profile,
      null,
      input.instructions,
      this.#beforeRequest,
    );
  }
}
