// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentRuntimePort,
  AgentScope,
} from "../../../application/agent/index.ts";

import { OpenAiCompatibleRuntimeSession } from "./openAiCompatibleSession.ts";
import type { OpenAiChatAgentProfile } from "../../../application/agentHost/index.ts";

export class OpenAiChatRuntime implements AgentRuntimePort {
  readonly #apiKey: string;
  readonly #profile: OpenAiChatAgentProfile;
  readonly kind = "openai-chat" as const;
  readonly #beforeRequest: () => Promise<void>;

  constructor(
    profile: OpenAiChatAgentProfile,
    apiKey: string,
    beforeRequest: () => Promise<void> = async () => undefined,
  ) {
    this.#profile = profile;
    this.#apiKey = apiKey;
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
      this.#apiKey,
      input.instructions,
      this.#beforeRequest,
    );
  }
}
