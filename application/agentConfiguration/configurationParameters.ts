// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentChatReasoningEffort,
  AgentProfileParameters,
} from "./agentConfiguration.ts";

export function positiveInteger(value: unknown, pathLabel: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${pathLabel} must be a positive integer.`);
  }
  return value as number;
}

function requireParameterRecord(
  value: unknown,
  pathLabel: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${pathLabel} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertParameterFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  pathLabel: string,
) {
  const expected = new Set(fields);
  const actual = Object.keys(record);
  if (
    actual.length !== expected.size ||
    actual.some((key) => !expected.has(key))
  ) {
    throw new Error(`${pathLabel} has unsupported or missing fields.`);
  }
}

/** Current Profile parameter contract, shared by writes and persisted-state reads. */
export function parseAgentProfileParameters(
  value: unknown,
  pathLabel: string,
): AgentProfileParameters {
  const record = requireParameterRecord(value, pathLabel);

  if (record.kind === "codex") {
    assertParameterFields(record, [
      "kind", "maxInputCharacters", "maxOutputCharacters", "reasoningEffort",
    ], pathLabel);
    if (!(["low", "medium", "high", "xhigh"] as const).includes(
      record.reasoningEffort as "low" | "medium" | "high" | "xhigh",
    )) {
      throw new Error(`${pathLabel}.reasoningEffort is invalid.`);
    }
    return {
      kind: "codex",
      maxInputCharacters: positiveInteger(
        record.maxInputCharacters,
        `${pathLabel}.maxInputCharacters`,
      ),
      maxOutputCharacters: positiveInteger(
        record.maxOutputCharacters,
        `${pathLabel}.maxOutputCharacters`,
      ),
      reasoningEffort: record.reasoningEffort as "low" | "medium" | "high" | "xhigh",
    };
  }
  if (record.kind === "chat") {
    assertParameterFields(record, [
      "historyBudgetCharacters", "kind", "maxOutputTokens", "maxToolSteps",
      "reasoningEffort", "toolCallMode",
    ], pathLabel);
    if (record.toolCallMode !== "native" && record.toolCallMode !== "single-json") {
      throw new Error(`${pathLabel}.toolCallMode is invalid.`);
    }
    if (!(["model-default", "none", "low", "medium", "high"] as const).includes(
      record.reasoningEffort as AgentChatReasoningEffort,
    )) {
      throw new Error(`${pathLabel}.reasoningEffort is invalid.`);
    }
    return {
      historyBudgetCharacters: positiveInteger(
        record.historyBudgetCharacters,
        `${pathLabel}.historyBudgetCharacters`,
      ),
      kind: "chat",
      maxOutputTokens: positiveInteger(
        record.maxOutputTokens,
        `${pathLabel}.maxOutputTokens`,
      ),
      maxToolSteps: positiveInteger(
        record.maxToolSteps,
        `${pathLabel}.maxToolSteps`,
      ),
      reasoningEffort: record.reasoningEffort as AgentChatReasoningEffort,
      toolCallMode: record.toolCallMode,
    };
  }
  throw new Error(`${pathLabel}.kind is invalid.`);
}
