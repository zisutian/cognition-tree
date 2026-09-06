// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentProfileInput,
  AgentProviderInput,
} from "../../../application/agent/agentConfiguration.ts";
import { AgentConfigurationValidationError } from "../../../application/agentHost/configurationErrors.ts";
import type { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import {
  nonEmptyString,
  parseBaseUrl,
  parseCurrentStoredAgentProfileParameters,
  positiveInteger,
  type StoredProfile,
  type StoredProvider,
} from "./configurationStateCodec.ts";

export function normalizeProviderInput(
  input: AgentProviderInput,
  targetPolicy: AgentProviderTargetPolicy,
): Omit<StoredProvider, "authentication" | "id" | "version"> {
  const label = nonEmptyString(input.label, "Provider label");
  const baseUrl = input.kind === "codex"
    ? input.baseUrl === null
      ? null
      : (() => {
          throw new AgentConfigurationValidationError("Codex baseUrl must be null");
        })()
    : parseBaseUrl(input.baseUrl, "Provider baseUrl");

  if (input.kind === "codex" && input.authenticationType === "none") {
    throw new AgentConfigurationValidationError("Codex authentication cannot be none");
  }
  if (input.kind !== "codex" &&
      input.authenticationType === "chatgpt-device-code") {
    throw new AgentConfigurationValidationError(
      "Device-code authentication requires a Codex provider",
    );
  }
  if (input.authenticationType !== "api-key" && input.apiKey !== undefined) {
    throw new AgentConfigurationValidationError(
      "Only api-key authentication can include an API key",
    );
  }
  if (input.authenticationType === "api-key" && input.apiKey === "") {
    throw new AgentConfigurationValidationError("API key cannot be empty");
  }
  const privateNetworkOrigin = baseUrl === null
    ? null
    : targetPolicy.configurationPermission(
        new URL(baseUrl),
        input.authenticationType,
        input.privateNetworkAccessConfirmed,
      );

  return {
    baseUrl,
    kind: input.kind,
    label,
    privateNetworkOrigin,
  };
}

export function normalizeProfileInput(
  input: AgentProfileInput,
  provider: StoredProvider,
): Omit<StoredProfile, "conformance" | "id" | "version"> {
  const parameters = parseCurrentStoredAgentProfileParameters(
    input.parameters,
    "Profile parameters",
  );

  if ((provider.kind === "codex") !== (parameters.kind === "codex")) {
    throw new AgentConfigurationValidationError(
      "Profile parameters do not match provider kind",
    );
  }
  if (
    provider.kind !== "ollama" && parameters.kind === "chat" &&
    parameters.toolCallMode === "single-json"
  ) {
    throw new AgentConfigurationValidationError(
      "single-json is only valid for Ollama profiles",
    );
  }
  if (
    provider.kind !== "ollama" && parameters.kind === "chat" &&
    parameters.reasoningEffort !== "model-default"
  ) {
    throw new AgentConfigurationValidationError(
      "Explicit chat reasoning effort is only valid for Ollama profiles",
    );
  }
  if (parameters.kind === "chat" && parameters.maxToolSteps < 3) {
    throw new AgentConfigurationValidationError(
      "Chat profiles require at least 3 tool steps",
    );
  }
  return {
    label: nonEmptyString(input.label, "Profile label"),
    maxResidentSessions: positiveInteger(
      input.maxResidentSessions,
      "Profile maxResidentSessions",
    ),
    model: nonEmptyString(input.model, "Profile model"),
    parameters,
    providerId: provider.id,
    timeoutMilliseconds: positiveInteger(
      input.timeoutMilliseconds,
      "Profile timeoutMilliseconds",
    ),
  };
}
