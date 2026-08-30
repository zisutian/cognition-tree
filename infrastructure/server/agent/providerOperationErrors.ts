// SPDX-License-Identifier: GPL-3.0-or-later

export class AgentProviderOperationConflictError extends Error {
  constructor(
    message = "A conformance check is already running for this profile",
  ) {
    super(message);
    this.name = "AgentProviderOperationConflictError";
  }
}
