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
  restartRequired: boolean;
  revision: `sha256:${string}`;
  version: number;
}>;

export type SystemConfigurationInput = Omit<SystemConfiguration, "dataRoot">;

export type SystemConfigurationUpdateRequest = Readonly<{
  baseRevision: `sha256:${string}`;
  configuration: SystemConfigurationInput;
}>;

export type OwnerCredentialRotation = Readonly<{
  configuration: SystemConfigurationSnapshot;
  secret: string;
}>;

export type DataRootMigrationStatus = Readonly<{
  destination: string;
  errorMessage: string | null;
  id: string;
  source: string;
  status: "copying" | "failed" | "restarting" | "verifying";
}>;

export type SystemAdministrationPort = {
  clearOwnerCredential(baseRevision: string): Promise<SystemConfigurationSnapshot>;
  getMigration(migrationId: string): Promise<DataRootMigrationStatus>;
  load(): Promise<SystemConfigurationSnapshot>;
  migrateDataRoot(
    baseRevision: string,
    destination: string,
  ): Promise<DataRootMigrationStatus>;
  rotateOwnerCredential(baseRevision: string): Promise<OwnerCredentialRotation>;
  update(
    baseRevision: string,
    configuration: SystemConfigurationInput,
  ): Promise<SystemConfigurationSnapshot>;
};

export type SystemMaintenanceLease = {
  finish(): void;
};

export type SystemMaintenancePort = {
  begin(): Promise<SystemMaintenanceLease>;
};

export type SystemConfigurationState = Readonly<{
  configuration: SystemConfigurationSnapshot | null;
  errorMessage: string | null;
  loadStatus: "failed" | "idle" | "loading" | "ready";
  migration: DataRootMigrationStatus | null;
  operationStatus: "idle" | "working";
}>;

export type SystemConfigurationController = {
  clearOwnerCredential(): Promise<void>;
  getSnapshot(): SystemConfigurationState;
  load(): Promise<void>;
  migrateDataRoot(destination: string): Promise<void>;
  rotateOwnerCredential(): Promise<string>;
  subscribe(listener: () => void): () => void;
  update(
    request: SystemConfigurationUpdateRequest,
  ): Promise<SystemConfigurationSnapshot>;
};

export type OwnerAuthenticationPort = {
  load(): Promise<boolean>;
  login(secret: string): Promise<void>;
  logout(): Promise<void>;
};

export type OwnerAuthenticationState = Readonly<{
  authenticated: boolean;
  errorMessage: string | null;
  status: "failed" | "idle" | "loading" | "ready";
}>;

export type OwnerAuthenticationController = {
  getSnapshot(): OwnerAuthenticationState;
  load(): Promise<void>;
  login(secret: string): Promise<void>;
  logout(): Promise<void>;
  subscribe(listener: () => void): () => void;
};

export type SystemApplication = Readonly<{
  authenticationController: OwnerAuthenticationController;
  authenticationState: OwnerAuthenticationState;
  configurationController: SystemConfigurationController;
  configurationState: SystemConfigurationState;
}>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "System configuration failed.";
}

export function createSystemConfigurationController(
  port: SystemAdministrationPort,
  {
    pollMigration,
    pollMigrationIntervalMilliseconds,
  }: {
    pollMigration(milliseconds: number): Promise<void>;
    pollMigrationIntervalMilliseconds: number;
  },
): SystemConfigurationController {
  const listeners = new Set<() => void>();
  let state: SystemConfigurationState = {
    configuration: null,
    errorMessage: null,
    loadStatus: "idle",
    migration: null,
    operationStatus: "idle",
  };
  const publish = (patch: Partial<SystemConfigurationState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const revision = () => {
    if (!state.configuration) throw new Error("System configuration is not loaded.");
    return state.configuration.revision;
  };
  const mutate = async (
    operation: () => Promise<SystemConfigurationSnapshot>,
  ) => {
    publish({ errorMessage: null, operationStatus: "working" });
    try {
      const configuration = await operation();

      publish({
        configuration,
        operationStatus: "idle",
      });
      return configuration;
    } catch (error) {
      publish({ errorMessage: errorMessage(error), operationStatus: "idle" });
      throw error;
    }
  };

  return {
    async clearOwnerCredential() {
      await mutate(() => port.clearOwnerCredential(revision()));
    },
    getSnapshot: () => state,
    async load() {
      publish({ errorMessage: null, loadStatus: "loading" });
      try {
        publish({
          configuration: await port.load(),
          loadStatus: "ready",
        });
      } catch (error) {
        publish({ errorMessage: errorMessage(error), loadStatus: "failed" });
      }
    },
    async migrateDataRoot(destination) {
      publish({
        errorMessage: null,
        operationStatus: "working",
      });
      try {
        let migration = await port.migrateDataRoot(revision(), destination);

        publish({ migration });
        while (migration.status === "copying" || migration.status === "verifying") {
          await pollMigration(pollMigrationIntervalMilliseconds);
          migration = await port.getMigration(migration.id);
          publish({ migration });
        }
        if (migration.status === "failed") {
          throw new Error(migration.errorMessage ?? "Data-root migration failed.");
        }
        publish({ operationStatus: "idle" });
      } catch (error) {
        publish({ errorMessage: errorMessage(error), operationStatus: "idle" });
        throw error;
      }
    },
    async rotateOwnerCredential() {
      publish({ errorMessage: null, operationStatus: "working" });
      try {
        const rotated = await port.rotateOwnerCredential(revision());

        publish({
          configuration: rotated.configuration,
          operationStatus: "idle",
        });
        return rotated.secret;
      } catch (error) {
        publish({ errorMessage: errorMessage(error), operationStatus: "idle" });
        throw error;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: ({ baseRevision, configuration }) => mutate(() =>
      port.update(baseRevision, configuration)
    ),
  };
}

export function createOwnerAuthenticationController(
  port: OwnerAuthenticationPort,
): OwnerAuthenticationController {
  const listeners = new Set<() => void>();
  let state: OwnerAuthenticationState = {
    authenticated: false,
    errorMessage: null,
    status: "idle",
  };
  const publish = (patch: Partial<OwnerAuthenticationState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const fail = (error: unknown) => {
    publish({
      authenticated: false,
      errorMessage: errorMessage(error),
      status: "failed",
    });
  };

  return {
    getSnapshot: () => state,
    async load() {
      publish({ errorMessage: null, status: "loading" });
      try {
        publish({ authenticated: await port.load(), status: "ready" });
      } catch (error) {
        fail(error);
      }
    },
    async login(secret) {
      publish({ errorMessage: null, status: "loading" });
      try {
        await port.login(secret);
        publish({ authenticated: true, status: "ready" });
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    async logout() {
      publish({ errorMessage: null, status: "loading" });
      try {
        await port.logout();
        publish({ authenticated: false, status: "ready" });
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
