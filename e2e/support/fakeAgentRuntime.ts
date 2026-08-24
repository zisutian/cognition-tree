// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentRuntimePort,
  AgentRuntimeTurnRequest,
} from "../../application/agent/agentRuntimePort.ts";
import { AgentConfigurationStore } from "../../infrastructure/server/agent/configurationStore.ts";

export const e2eAgentProfileId = "agent-profile-e2e-agent";
export const e2eAgentAlternativeProfileId =
  "agent-profile-e2e-agent-alternative";
export const e2eAgentUnavailableProfileId =
  "agent-profile-e2e-agent-unavailable";
export const e2eAgentJournalBody = "Agent E2E committed body";
export const e2eAgentFirstDelta = "正在准备";
export const e2eAgentSecondDelta = "，proposal 已就绪。";

export async function createE2EAgentConfigurationStore(stateDirectory: string) {
  const ids = [
    "e2e-provider",
    "e2e-agent",
    "e2e-agent-alternative",
    "e2e-missing-provider",
    "e2e-agent-unavailable",
  ];
  const store = new AgentConfigurationStore(stateDirectory, {
    createId: () => ids.shift()!,
  });
  let configuration = await store.readSnapshot();
  const provider = await store.createProvider(configuration.revision, {
    apiKey: "e2e-only",
    authenticationType: "bearer",
    baseUrl: "https://e2e-runtime.invalid/v1",
    kind: "openai-chat",
    label: "E2E provider",
  });

  configuration = provider.configuration;
  for (const [label, model] of [
    ["E2E Agent", "deterministic-e2e"],
    ["E2E Agent Alternate", "deterministic-e2e-alternative"],
  ] as const) {
    const created = await store.createProfile(configuration.revision, {
      label,
      maxResidentSessions: 4,
      model,
      parameters: {
        contextWindowTokens: 8_192,
        kind: "chat",
        maxOutputTokens: 1_024,
        maxToolSteps: 8,
        toolCallMode: "native",
      },
      providerId: provider.provider.id,
      timeoutMilliseconds: 5_000,
    });

    configuration = (await store.setConformance(
      created.configuration.revision,
      created.profile.id,
      { checkedAt: "2026-08-20T08:00:00.000Z", toolCallMode: "native" },
    )).configuration;
  }
  const missingProvider = await store.createProvider(configuration.revision, {
    apiKey: null,
    authenticationType: "bearer",
    baseUrl: "https://e2e-missing.invalid/v1",
    kind: "openai-chat",
    label: "E2E missing provider",
  });
  const unavailable = await store.createProfile(
    missingProvider.configuration.revision,
    {
      label: "E2E Agent Missing",
      maxResidentSessions: 4,
      model: "deterministic-e2e-unavailable",
      parameters: {
        contextWindowTokens: 8_192,
        kind: "chat",
        maxOutputTokens: 1_024,
        maxToolSteps: 8,
        toolCallMode: "native",
      },
      providerId: missingProvider.provider.id,
      timeoutMilliseconds: 5_000,
    },
  );

  await store.setConformance(
    unavailable.configuration.revision,
    unavailable.profile.id,
    { checkedAt: "2026-08-20T08:00:00.000Z", toolCallMode: "native" },
  );
  return store;
}

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
