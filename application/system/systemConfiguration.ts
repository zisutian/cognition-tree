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

export type DataRootMigrationStatus = Readonly<{
  destination: string;
  errorMessage: string | null;
  id: string;
  source: string;
  status: "copying" | "failed" | "restarting" | "verifying";
}>;

export type SystemAdministrationPort = {
  activateOwnerCredentialRotation(
    baseRevision: string,
    rotationId: string,
    secret: string,
  ): Promise<SystemConfigurationSnapshot>;
  clearOwnerCredential(baseRevision: string): Promise<SystemConfigurationSnapshot>;
  getMigration(migrationId: string): Promise<DataRootMigrationStatus>;
  load(): Promise<SystemConfigurationSnapshot>;
  migrateDataRoot(
    baseRevision: string,
    destination: string,
  ): Promise<DataRootMigrationStatus>;
  prepareOwnerCredentialRotation(
    baseRevision: string,
  ): Promise<OwnerCredentialRotationPreparation>;
  update(
    baseRevision: string,
    configuration: SystemConfigurationInput,
  ): Promise<SystemConfigurationSnapshot>;
};

export type OwnerCredentialRotationCommit = Readonly<{
  configuration: SystemConfigurationSnapshot;
  ownerSession: string;
}>;

export type SystemAdministrationServerPort = Omit<
  SystemAdministrationPort,
  "activateOwnerCredentialRotation"
> & Readonly<{
  activateOwnerCredentialRotation(
    baseRevision: string,
    rotationId: string,
    secret: string,
  ): Promise<OwnerCredentialRotationCommit>;
}>;

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
  activateOwnerCredentialRotation(
    activation: OwnerCredentialRotationActivation,
  ): Promise<void>;
  clearOwnerCredential(): Promise<void>;
  getSnapshot(): SystemConfigurationState;
  load(): Promise<void>;
  migrateDataRoot(destination: string): Promise<void>;
  prepareOwnerCredentialRotation(): Promise<OwnerCredentialRotationPreparation>;
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
  let configurationAuthorityVersion = 0;
  let loadRequestVersion = 0;
  let operationCount = 0;
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
  const installConfiguration = (configuration: SystemConfigurationSnapshot) => {
    configurationAuthorityVersion += 1;
    publish({ configuration, loadStatus: "ready" });
  };
  const installOperationConfiguration = (
    expectedAuthorityVersion: number,
    configuration: SystemConfigurationSnapshot,
  ) => {
    if (
      configurationAuthorityVersion !== expectedAuthorityVersion &&
      state.configuration?.revision !== configuration.revision
    ) return;
    installConfiguration(configuration);
  };
  const runOperation = async <Result>(operation: () => Promise<Result>) => {
    operationCount += 1;
    publish({ errorMessage: null, operationStatus: "working" });
    try {
      return await operation();
    } catch (error) {
      publish({ errorMessage: errorMessage(error) });
      throw error;
    } finally {
      operationCount -= 1;
      publish({ operationStatus: operationCount > 0 ? "working" : "idle" });
    }
  };
  const mutate = (
    operation: () => Promise<SystemConfigurationSnapshot>,
  ) => {
    const expectedAuthorityVersion = configurationAuthorityVersion;

    return runOperation(async () => {
      const configuration = await operation();

      installOperationConfiguration(expectedAuthorityVersion, configuration);
      return configuration;
    });
  };

  return {
    async activateOwnerCredentialRotation({ baseRevision, rotationId, secret }) {
      await mutate(() =>
        port.activateOwnerCredentialRotation(baseRevision, rotationId, secret)
      );
    },
    async clearOwnerCredential() {
      const baseRevision = revision();

      await mutate(() => port.clearOwnerCredential(baseRevision));
    },
    getSnapshot: () => state,
    async load() {
      const requestVersion = ++loadRequestVersion;
      const expectedAuthorityVersion = configurationAuthorityVersion;

      publish({ errorMessage: null, loadStatus: "loading" });
      try {
        const configuration = await port.load();

        if (
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        installConfiguration(configuration);
      } catch (error) {
        if (
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        publish({ errorMessage: errorMessage(error), loadStatus: "failed" });
      }
    },
    async migrateDataRoot(destination) {
      const baseRevision = revision();

      await runOperation(async () => {
        let migration = await port.migrateDataRoot(baseRevision, destination);

        publish({ migration });
        while (migration.status === "copying" || migration.status === "verifying") {
          await pollMigration(pollMigrationIntervalMilliseconds);
          migration = await port.getMigration(migration.id);
          publish({ migration });
        }
        if (migration.status === "failed") {
          throw new Error(migration.errorMessage ?? "Data-root migration failed.");
        }
      });
    },
    prepareOwnerCredentialRotation() {
      const expectedAuthorityVersion = configurationAuthorityVersion;
      const baseRevision = revision();

      return runOperation(async () => {
        const preparation = await port.prepareOwnerCredentialRotation(
          baseRevision,
        );

        installOperationConfiguration(
          expectedAuthorityVersion,
          preparation.configuration,
        );
        return preparation;
      });
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
