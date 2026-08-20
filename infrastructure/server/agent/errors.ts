// SPDX-License-Identifier: GPL-3.0-or-later

export type AgentServiceErrorCode =
  | "invalid_request"
  | "not_found"
  | "profile_unavailable"
  | "proposal_stale"
  | "session_capacity_reached"
  | "session_unavailable";

export class AgentServiceError extends Error {
  readonly code: AgentServiceErrorCode;

  constructor(code: AgentServiceErrorCode, message: string) {
    super(message);
    this.name = "AgentServiceError";
    this.code = code;
  }
}
