// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentRuntimePort,
  AgentRuntimeTurnRequest,
} from "../../application/agent/agentRuntimePort.ts";
import type {
  AgentProfileCatalog,
  OpenAiChatAgentProfile,
} from "../../infrastructure/server/agent/profiles.ts";

export const e2eAgentProfileId = "e2e-agent";
export const e2eAgentAlternativeProfileId = "e2e-agent-alternative";
export const e2eAgentUnavailableProfileId = "e2e-agent-unavailable";
export const e2eAgentJournalBody = "Agent E2E committed body";
export const e2eAgentFirstDelta = "正在准备";
export const e2eAgentSecondDelta = "，proposal 已就绪。";

const profile: OpenAiChatAgentProfile = {
  apiKeyEnv: "CTN_E2E_AGENT_KEY",
  baseUrl: "https://e2e-runtime.invalid/v1",
  contextWindowTokens: 8_192,
  id: e2eAgentProfileId,
  kind: "openai-chat",
  label: "E2E Agent",
  maxOutputTokens: 1_024,
  maxResidentSessions: 4,
  maxToolSteps: 8,
  model: "deterministic-e2e",
  timeoutMilliseconds: 5_000,
};
const alternativeProfile: OpenAiChatAgentProfile = {
  ...profile,
  id: e2eAgentAlternativeProfileId,
  label: "E2E Agent Alternate",
  model: "deterministic-e2e-alternative",
};
const unavailableProfile: OpenAiChatAgentProfile = {
  ...profile,
  apiKeyEnv: "CTN_E2E_AGENT_MISSING_KEY",
  id: e2eAgentUnavailableProfileId,
  label: "E2E Agent Missing",
  model: "deterministic-e2e-unavailable",
};

export const e2eAgentProfileCatalog: AgentProfileCatalog = {
  absoluteTtlMilliseconds: 24 * 60 * 60 * 1_000,
  configurationProblem: null,
  idleTtlMilliseconds: 60 * 60 * 1_000,
  maxAuditEntries: 100,
  profiles: [{
    authenticationStatus: "configured",
    availability: "available",
    config: profile,
    id: profile.id,
    kind: profile.kind,
    label: profile.label,
    model: profile.model,
    unavailableReason: null,
  }, {
    authenticationStatus: "configured",
    availability: "available",
    config: alternativeProfile,
    id: alternativeProfile.id,
    kind: alternativeProfile.kind,
    label: alternativeProfile.label,
    model: alternativeProfile.model,
    unavailableReason: null,
  }, {
    authenticationStatus: "missing",
    availability: "unavailable",
    config: unavailableProfile,
    id: unavailableProfile.id,
    kind: unavailableProfile.kind,
    label: unavailableProfile.label,
    model: unavailableProfile.model,
    unavailableReason:
      "Environment variable CTN_E2E_AGENT_MISSING_KEY is not set",
  }],
};

function abortError() {
  const error = new Error("E2E Agent turn was cancelled");

  error.name = "AbortError";
  return error;
}

function waitForSecondDelta(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timeout = setTimeout(finish, 2_500);

    function finish() {
      signal.removeEventListener("abort", cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timeout);
      reject(abortError());
    }
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function runTurn(request: AgentRuntimeTurnRequest) {
  if (request.tools.length === 0) {
    return { finalText: "Commit completed.", toolCalls: 0 };
  }
  await request.onEvent({ textDelta: e2eAgentFirstDelta, type: "text-delta" });
  await waitForSecondDelta(request.signal);
  await request.executeTool({
    arguments: { body: e2eAgentJournalBody, kind: "create-entry" },
    callId: "00000000-0000-4000-8000-000000000901",
    name: "stage_journal_command",
  });
  await request.executeTool({
    arguments: {},
    callId: "00000000-0000-4000-8000-000000000902",
    name: "submit_proposal",
  });
  await request.onEvent({ textDelta: e2eAgentSecondDelta, type: "text-delta" });
  return {
    finalText: `${e2eAgentFirstDelta}${e2eAgentSecondDelta}`,
    toolCalls: 2,
  };
}

export function createE2EAgentRuntime(): AgentRuntimePort {
  return {
    kind: "openai-chat",
    async openSession() {
      return {
        async cancel() {},
        async dispose() {},
        runTurn,
      };
    },
  };
}
