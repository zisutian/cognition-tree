// SPDX-License-Identifier: GPL-3.0-or-later

export class AgentConfigurationConflictError extends Error {
  readonly currentRevision: `sha256:${string}`;

  constructor(currentRevision: `sha256:${string}`) {
    super("Agent configuration revision changed");
    this.name = "AgentConfigurationConflictError";
    this.currentRevision = currentRevision;
  }
}

export class AgentConfigurationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigurationValidationError";
  }
}
