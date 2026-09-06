// SPDX-License-Identifier: GPL-3.0-or-later

import type { DataRootMigrationStatus } from "./dataRootMigrationPorts.ts";
import type { SystemConfigurationSnapshot, SystemConfigurationInput, SystemConfigurationUpdateRequest, OwnerCredentialRotationPreparation, OwnerCredentialRotationActivation } from "./systemConfigurationModel.ts";

export type SystemAdministrationPort = {
  activateOwnerCredentialRotation(
    baseRevision: string,
    rotationId: string,
    secret: string,
  ): Promise<SystemConfigurationSnapshot>;
  clearOwnerCredential(baseRevision: string): Promise<SystemConfigurationSnapshot>;
  getCurrentMigration(): Promise<DataRootMigrationStatus | null>;
  reconcileMigration(migrationId: string): Promise<DataRootMigrationStatus>;
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
  reconcileMigration(): Promise<void>;
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
  let migrationRequestVersion = 0;
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

  const trackMigration = async (initial: DataRootMigrationStatus) => {
    const requestVersion = ++migrationRequestVersion;
    let migration = initial;
    const publishCurrent = () => {
      if (disposed || requestVersion !== migrationRequestVersion) return false;
      publish({ migration });
      return true;
    };
    if (!publishCurrent()) return;
    while (["preparing", "copying", "verifying", "committing", "reconciling"].includes(migration.status)) {
      await pollMigration(pollMigrationIntervalMilliseconds);
      if (disposed || requestVersion !== migrationRequestVersion) return;
      migration = await port.getMigration(migration.id);
      if (!publishCurrent()) return;
    }
    if (migration.status === "failed" || migration.status === "recovery-required") {
      throw new Error(migration.errorMessage ?? "Data-root migration needs attention.");
    }
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
      const expectedMigrationVersion = migrationRequestVersion;
      const expectedAuthorityVersion = configurationAuthorityVersion;

      publish({ errorMessage: null, loadStatus: "loading" });
      try {
        const [configuration, migration] = await Promise.all([port.load(), port.getCurrentMigration()]);

        if (
          disposed ||
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        installConfiguration(configuration);
        if (expectedMigrationVersion === migrationRequestVersion) {
          if (migration) void runOperation(() => trackMigration(migration)).catch(() => undefined);
          else publish({ migration: null });
        }
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
        const migration = await port.migrateDataRoot(baseRevision, destination);
        if (!disposed) await trackMigration(migration);
      });
    },
    async reconcileMigration() {
      requireActive();
      const migration = state.migration;
      if (!migration) throw new Error("No migration is available to reconcile");
      await runOperation(async () => trackMigration(await port.reconcileMigration(migration.id)));
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
