// SPDX-License-Identifier: GPL-3.0-or-later

export const agentIdleTtlMilliseconds = 60 * 60 * 1_000;
export const agentAbsoluteTtlMilliseconds = 24 * 60 * 60 * 1_000;

export type AgentServicePolicy = Readonly<{
  absoluteTtlMilliseconds: number;
  configurationProblem: string | null;
  idleTtlMilliseconds: number;
  maxAuditEntries: number | null;
}>;

export function loadAgentServicePolicy(
  value: string | undefined,
): AgentServicePolicy {
  const source = value?.trim() ?? "";
  const parsed = Number(source);
  const valid = source.length > 0 && Number.isSafeInteger(parsed) && parsed > 0;

  return {
    absoluteTtlMilliseconds: agentAbsoluteTtlMilliseconds,
    configurationProblem: valid
      ? null
      : "CTN_AGENT_MAX_AUDIT_ENTRIES must be a positive integer",
    idleTtlMilliseconds: agentIdleTtlMilliseconds,
    maxAuditEntries: valid ? parsed : null,
  };
}
