// SPDX-License-Identifier: GPL-3.0-or-later



export class VersionedContentRevisionConflictError extends Error {
  currentRevision: `sha256:${string}`;

  constructor(currentRevision: `sha256:${string}`) {
    super("Versioned content changed outside the current session");
    this.name = "VersionedContentRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

export class VersionedContentCommitOutcomeUnknownError extends Error {
  readonly cause: unknown;
  readonly commitOutcome = "unknown" as const;
  readonly currentRevision: `sha256:${string}` | null;

  constructor(
    cause: unknown,
    currentRevision: `sha256:${string}` | null,
  ) {
    super("Versioned content durable commit outcome could not be verified");
    this.name = "VersionedContentCommitOutcomeUnknownError";
    this.cause = cause;
    this.currentRevision = currentRevision;
  }
}
