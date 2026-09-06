// SPDX-License-Identifier: GPL-3.0-or-later



export const agentIdleTtlMilliseconds = 60 * 60 * 1_000;
export const agentAbsoluteTtlMilliseconds = 24 * 60 * 60 * 1_000;

export type AgentServicePolicy = Readonly<{
  absoluteTtlMilliseconds: number;
  configurationProblem: string | null;
  idleTtlMilliseconds: number;
}>;

export const agentServicePolicy: AgentServicePolicy = {
  absoluteTtlMilliseconds: agentAbsoluteTtlMilliseconds,
  configurationProblem: null,
  idleTtlMilliseconds: agentIdleTtlMilliseconds,
};
