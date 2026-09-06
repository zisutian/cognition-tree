// SPDX-License-Identifier: GPL-3.0-or-later



export class SecureStatePartitionError extends Error {
  readonly partition: string;

  constructor(partition: string, message: string) {
    super(`CTN ${partition} state is unavailable: ${message}`);
    this.name = "SecureStatePartitionError";
    this.partition = partition;
  }
}

export class SecureStateCommitOutcomeUnknownError extends SecureStatePartitionError {
  readonly commitOutcome = "unknown" as const;
  readonly cause: unknown;

  constructor(partition: string, cause: unknown) {
    super(partition, "durable write outcome could not be verified");
    this.name = "SecureStateCommitOutcomeUnknownError";
    this.cause = cause;
  }
}
