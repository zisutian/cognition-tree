// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from "node:fs/promises";
import path from "node:path";

export const agentIdleTtlMilliseconds = 60 * 60 * 1_000;
export const agentAbsoluteTtlMilliseconds = 24 * 60 * 60 * 1_000;

type AgentProfileBase = {
  apiKeyEnv: string;
  id: string;
  label: string;
  maxResidentSessions: number;
  model: string;
  timeoutMilliseconds: number;
};

export type CodexAgentProfile = AgentProfileBase & {
  kind: "codex";
  maxInputCharacters: number;
  maxOutputCharacters: number;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
};

export type OpenAiChatAgentProfile = AgentProfileBase & {
  baseUrl: string;
  contextWindowTokens: number;
  kind: "openai-chat";
  maxOutputTokens: number;
  maxToolSteps: number;
};

export type AgentProfile = CodexAgentProfile | OpenAiChatAgentProfile;

export type LoadedAgentProfile = {
  availability: "available" | "unavailable";
  config: AgentProfile | null;
  id: string;
  kind: AgentProfile["kind"];
  label: string;
  unavailableReason: string | null;
};

export type AgentProfileCatalog = {
  absoluteTtlMilliseconds: number;
  configurationProblem: string | null;
  idleTtlMilliseconds: number;
  maxAuditEntries: number | null;
  profiles: readonly LoadedAgentProfile[];
};

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  label: string,
) {
  const expected = new Set(fields);

  if (
    Object.keys(record).length !== expected.size ||
    Object.keys(record).some((field) => !expected.has(field))
  ) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function stringField(
  record: Record<string, unknown>,
  field: string,
  label: string,
) {
  const value = record[field];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}.${field} must be a non-empty string`);
  }
  return value;
}

function positiveInteger(
  record: Record<string, unknown>,
  field: string,
  label: string,
) {
  const value = record[field];

  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label}.${field} must be a positive integer`);
  }
  return value as number;
}

function parseBase(record: Record<string, unknown>, label: string) {
  const apiKeyEnv = stringField(record, "apiKeyEnv", label);

  if (!/^[A-Z_][A-Z0-9_]*$/.test(apiKeyEnv)) {
    throw new Error(`${label}.apiKeyEnv must be an uppercase environment name`);
  }
  return {
    apiKeyEnv,
    id: stringField(record, "id", label),
    label: stringField(record, "label", label),
    maxResidentSessions: positiveInteger(record, "maxResidentSessions", label),
    model: stringField(record, "model", label),
    timeoutMilliseconds: positiveInteger(record, "timeoutMilliseconds", label),
  };
}

function parseProfile(value: unknown, index: number): AgentProfile {
  const label = `profiles[${index}]`;
  const record = requireRecord(value, label);
  const kind = record.kind;

  if (kind === "codex") {
    exactFields(record, [
      "apiKeyEnv", "id", "kind", "label", "maxInputCharacters",
      "maxOutputCharacters", "maxResidentSessions", "model",
      "reasoningEffort", "timeoutMilliseconds",
    ], label);
    const effort = record.reasoningEffort;

    if (!["low", "medium", "high", "xhigh"].includes(String(effort))) {
      throw new Error(`${label}.reasoningEffort is invalid`);
    }
    return {
      ...parseBase(record, label),
      kind,
      maxInputCharacters: positiveInteger(record, "maxInputCharacters", label),
      maxOutputCharacters: positiveInteger(record, "maxOutputCharacters", label),
      reasoningEffort: effort as CodexAgentProfile["reasoningEffort"],
    };
  }
  if (kind === "openai-chat") {
    exactFields(record, [
      "apiKeyEnv", "baseUrl", "contextWindowTokens", "id", "kind", "label",
      "maxOutputTokens", "maxResidentSessions", "maxToolSteps", "model",
      "timeoutMilliseconds",
    ], label);
    const baseUrl = stringField(record, "baseUrl", label);
    let url: URL;

    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error(`${label}.baseUrl must be an absolute URL`);
    }
    if (!(["http:", "https:"] as const).includes(url.protocol as "http:" | "https:")) {
      throw new Error(`${label}.baseUrl must use HTTP or HTTPS`);
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error(
        "OpenAI-compatible baseUrl cannot contain credentials, a query, or a fragment",
      );
    }
    return {
      ...parseBase(record, label),
      baseUrl: url.toString().replace(/\/$/, ""),
      contextWindowTokens: positiveInteger(record, "contextWindowTokens", label),
      kind,
      maxOutputTokens: positiveInteger(record, "maxOutputTokens", label),
      maxToolSteps: positiveInteger(record, "maxToolSteps", label),
    };
  }
  throw new Error(`${label}.kind is invalid`);
}

function unavailableProfile(value: unknown, index: number, reason: string) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    availability: "unavailable" as const,
    config: null,
    id: typeof record.id === "string" && record.id ? record.id : `invalid-${index}`,
    kind: record.kind === "openai-chat" ? "openai-chat" as const : "codex" as const,
    label: typeof record.label === "string" && record.label
      ? record.label
      : `Invalid profile ${index + 1}`,
    unavailableReason: reason,
  };
}

export async function loadAgentProfileCatalog(
  filePath: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AgentProfileCatalog> {
  const disabled: AgentProfileCatalog = {
    absoluteTtlMilliseconds: agentAbsoluteTtlMilliseconds,
    configurationProblem: "CTN_AGENT_PROFILES_FILE is not configured",
    idleTtlMilliseconds: agentIdleTtlMilliseconds,
    maxAuditEntries: null,
    profiles: [],
  };

  if (!filePath?.trim()) return disabled;
  let source: string;

  try {
    source = await readFile(path.resolve(filePath), "utf8");
  } catch (error) {
    return {
      ...disabled,
      configurationProblem: error instanceof Error
        ? `Agent profile file cannot be read: ${error.message}`
        : "Agent profile file cannot be read",
    };
  }
  try {
    const root = requireRecord(JSON.parse(source) as unknown, "Agent profile file");

    exactFields(root, [
      "absoluteTtlMilliseconds", "formatVersion", "idleTtlMilliseconds",
      "maxAuditEntries", "profiles",
    ], "Agent profile file");
    if (root.formatVersion !== 1) {
      throw new Error("Agent profile file formatVersion must be 1");
    }
    if (root.idleTtlMilliseconds !== agentIdleTtlMilliseconds) {
      throw new Error("idleTtlMilliseconds must be exactly 3600000");
    }
    if (root.absoluteTtlMilliseconds !== agentAbsoluteTtlMilliseconds) {
      throw new Error("absoluteTtlMilliseconds must be exactly 86400000");
    }
    const maxAuditEntries = positiveInteger(
      root,
      "maxAuditEntries",
      "Agent profile file",
    );
    if (!Array.isArray(root.profiles)) {
      throw new Error("Agent profile file.profiles must be an array");
    }
    const profiles = root.profiles.map((value, index): LoadedAgentProfile => {
      try {
        const config = parseProfile(value, index);
        const secret = environment[config.apiKeyEnv];

        return secret
          ? {
              availability: "available",
              config,
              id: config.id,
              kind: config.kind,
              label: config.label,
              unavailableReason: null,
            }
          : unavailableProfile(
              value,
              index,
              `Environment variable ${config.apiKeyEnv} is not set`,
            );
      } catch (error) {
        return unavailableProfile(
          value,
          index,
          error instanceof Error ? error.message : "Profile is invalid",
        );
      }
    });
    const profileCounts = new Map<string, number>();

    for (const { id } of profiles) {
      profileCounts.set(id, (profileCounts.get(id) ?? 0) + 1);
    }
    for (const profile of profiles) {
      if ((profileCounts.get(profile.id) ?? 0) > 1) {
        profile.availability = "unavailable";
        profile.config = null;
        profile.unavailableReason = "Profile id is duplicated";
      }
    }
    return {
      absoluteTtlMilliseconds: agentAbsoluteTtlMilliseconds,
      configurationProblem: null,
      idleTtlMilliseconds: agentIdleTtlMilliseconds,
      maxAuditEntries,
      profiles,
    };
  } catch (error) {
    return {
      ...disabled,
      configurationProblem: error instanceof Error
        ? error.message
        : "Agent profile file is invalid",
    };
  }
}
