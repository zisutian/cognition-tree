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
  dispose(): void;
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
    prepareMigration = async () => undefined,
  }: {
    pollMigration(milliseconds: number): Promise<void>;
    pollMigrationIntervalMilliseconds: number;
    prepareMigration?: () => Promise<void>;
  },
): SystemConfigurationController {
  const listeners = new Set<() => void>();
  let configurationAuthorityVersion = 0;
  let disposed = false;
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
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const requireActive = () => {
    if (disposed) {
      throw new Error("System configuration controller is disposed.");
    }
  };
  const revision = () => {
    if (!state.configuration) throw new Error("System configuration is not loaded.");
    return state.configuration.revision;
  };
  const installConfiguration = (configuration: SystemConfigurationSnapshot) => {
    if (disposed) return;
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
    requireActive();
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
      requireActive();
      const baseRevision = revision();

      await mutate(() => port.clearOwnerCredential(baseRevision));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loadRequestVersion += 1;
      listeners.clear();
    },
    getSnapshot: () => state,
    async load() {
      requireActive();
      const requestVersion = ++loadRequestVersion;
      const expectedAuthorityVersion = configurationAuthorityVersion;

      publish({ errorMessage: null, loadStatus: "loading" });
      try {
        const configuration = await port.load();

        if (
          disposed ||
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        installConfiguration(configuration);
      } catch (error) {
        if (
          disposed ||
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        publish({ errorMessage: errorMessage(error), loadStatus: "failed" });
      }
    },
    async migrateDataRoot(destination) {
      requireActive();
      const baseRevision = revision();

      await runOperation(async () => {
        await prepareMigration();
        if (disposed) return;
        let migration = await port.migrateDataRoot(baseRevision, destination);

        if (disposed) return;
        publish({ migration });
        while (migration.status === "copying" || migration.status === "verifying") {
          await pollMigration(pollMigrationIntervalMilliseconds);
          if (disposed) return;
          migration = await port.getMigration(migration.id);
          if (disposed) return;
          publish({ migration });
        }
        if (migration.status === "failed") {
          throw new Error(migration.errorMessage ?? "Data-root migration failed.");
        }
      });
    },
    async prepareOwnerCredentialRotation() {
      requireActive();
      const expectedAuthorityVersion = configurationAuthorityVersion;
      const baseRevision = revision();

      return await runOperation(async () => {
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
      if (disposed) return () => undefined;
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
  let authenticationMutationVersion = 0;
  let loadRequestVersion = 0;
  let mutationQueue: Promise<void> = Promise.resolve();
  let pendingMutationCount = 0;
  let state: OwnerAuthenticationState = {
    authenticated: false,
    errorMessage: null,
    status: "idle",
  };
  const publish = (patch: Partial<OwnerAuthenticationState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const awaitMutationDrain = async () => {
    while (true) {
      const observedQueue = mutationQueue;

      await observedQueue;
      if (observedQueue === mutationQueue) {
        return authenticationMutationVersion;
      }
    }
  };
  const mutate = (
    operation: () => Promise<void>,
    authenticated: boolean,
  ) => {
    authenticationMutationVersion += 1;
    pendingMutationCount += 1;
    publish({ errorMessage: null, status: "loading" });
    const pending = mutationQueue.then(async () => {
      publish({ errorMessage: null, status: "loading" });
      try {
        await operation();
        pendingMutationCount -= 1;
        publish({
          authenticated,
          status: pendingMutationCount > 0 ? "loading" : "ready",
        });
      } catch (error) {
        pendingMutationCount -= 1;
        publish({
          authenticated: false,
          errorMessage: errorMessage(error),
          status: pendingMutationCount > 0 ? "loading" : "failed",
        });
        throw error;
      }
    });

    mutationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  };

  return {
    getSnapshot: () => state,
    async load() {
      const requestVersion = ++loadRequestVersion;

      publish({ errorMessage: null, status: "loading" });
      const expectedMutationVersion = await awaitMutationDrain();

      if (requestVersion !== loadRequestVersion) return;

      publish({ status: "loading" });
      try {
        const authenticated = await port.load();

        if (
          requestVersion !== loadRequestVersion ||
          expectedMutationVersion !== authenticationMutationVersion
        ) return;
        publish({ authenticated, status: "ready" });
      } catch (error) {
        if (
          requestVersion !== loadRequestVersion ||
          expectedMutationVersion !== authenticationMutationVersion
        ) return;
        publish({
          authenticated: false,
          errorMessage: errorMessage(error),
          status: "failed",
        });
      }
    },
    login: (secret) => mutate(() => port.login(secret), true),
    logout: () => mutate(() => port.logout(), false),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
