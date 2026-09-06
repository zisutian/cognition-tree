// SPDX-License-Identifier: GPL-3.0-or-later



export type SystemListenMode = "lan" | "loopback";

export class SystemConfigurationConflictError extends Error {
  readonly currentRevision: `sha256:${string}`;

  constructor(currentRevision: `sha256:${string}`) {
    super("System configuration revision changed");
    this.name = "SystemConfigurationConflictError";
    this.currentRevision = currentRevision;
  }
}

export class SystemConfigurationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemConfigurationValidationError";
  }
}

export class SystemMigrationConflictError extends Error {
  readonly currentRevision?: `sha256:${string}`;

  constructor(message: string, currentRevision?: `sha256:${string}`) {
    super(message);
    this.name = "SystemMigrationConflictError";
    this.currentRevision = currentRevision;
  }
}

export class SystemMigrationNotFoundError extends Error {
  constructor() {
    super("Data-root migration does not exist");
    this.name = "SystemMigrationNotFoundError";
  }
}

export class SystemMigrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemMigrationValidationError";
  }
}

export type AgentAuditCapacityPort = {
  updateMaximumEntries(maxAuditEntries: number): Promise<void>;
};

export type SystemConfiguration = Readonly<{
  dataRoot: string;
  listenMode: SystemListenMode;
  maxAuditEntries: number;
  port: number;
  publicOrigin: string | null;
  repositoryHostRoot: string | null;
}>;

export type SystemConfigurationSnapshot = Readonly<{
  configuration: SystemConfiguration;
  effectiveConfiguration: SystemConfiguration;
  ownerCredentialConfigured: boolean;
  ownerCredentialRotationPending: boolean;
  restartRequired: boolean;
  revision: `sha256:${string}`;
  runtimeApplyErrorMessage: string | null;
  version: number;
}>;

export type SystemConfigurationInput = Omit<SystemConfiguration, "dataRoot">;

export type SystemConfigurationUpdateRequest = Readonly<{
  baseRevision: `sha256:${string}`;
  configuration: SystemConfigurationInput;
}>;

export type OwnerCredentialRotationPreparation = Readonly<{
  configuration: SystemConfigurationSnapshot;
  rotationId: string;
  secret: string;
}>;

export type OwnerCredentialRotationActivation = Readonly<{
  baseRevision: `sha256:${string}`;
  rotationId: string;
  secret: string;
}>;
