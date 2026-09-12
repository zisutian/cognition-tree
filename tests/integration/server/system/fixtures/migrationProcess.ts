// SPDX-License-Identifier: GPL-3.0-or-later

import { localRepositoryWriterLockName } from "../../../../../infrastructure/server/repository/repositoryRuntimeLayout.ts";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ApplicationWriteBarrier } from "../../../../../application/runtime/writeBarrier.ts";
import { DataRootMigrationCoordinator } from "../../../../../application/system/dataRootMigrationCoordinator.ts";
import { replaceFileDurably } from "../../../../../infrastructure/server/persistence/fileSystemPersistence.ts";
import { BootstrapConfigurationStore } from "../../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import { createDataRootMigrationFileOperations } from "../../../../../infrastructure/server/system/dataRootMigrationFiles.ts";
import { FileDataRootMigrationRecordStore } from "../../../../../infrastructure/server/system/dataRootMigrationRecordStore.ts";

const dataRootMigrationFileOperations = createDataRootMigrationFileOperations(localRepositoryWriterLockName);










const [projectRoot, destination, mode, stopPhase] = process.argv.slice(2) as [string, string, string, string];
process.on("message", () => undefined);
const send = (value: unknown) => process.send?.(value);
async function pause(phase: string) {
  if (stopPhase !== phase) return;
  send({ phase, kind: "paused" });
  await new Promise<void>(() => undefined);
}
const barrier = new ApplicationWriteBarrier();
const bootstrap = new BootstrapConfigurationStore(projectRoot, {
  replaceConfigurationFile: async (file, source, options) => {
    await replaceFileDurably(file, source, options);
    if (mode === "start" && source.includes(destination)) await pause("pointer-replaced");
  },
});
const controlRoot = path.join(projectRoot, ".cognition-tree", "bootstrap-v1");
const records = new FileDataRootMigrationRecordStore(controlRoot);
const coordinator = new DataRootMigrationCoordinator({
  bootstrap, controlRoot, createId: randomUUID, hasActiveAgentWork: () => false,
  maintenance: barrier,
  files: dataRootMigrationFileOperations,
  records: {
    load: () => records.load(),
    reconcile: () => records.reconcile(),
    replace: async (previous, next) => {
      await records.replace(previous, next);
      if (mode === "start") {
        if (next.status === "copying" && next.targetIdentity) await pause("allocated");
        else await pause(next.status);
      }
    },
  },
  requestRestart: async () => { send({ kind: "restart", closed: barrier.isClosed() }); },
});
try {
  if (mode === "start") {
    const initial = await bootstrap.readSnapshot();
    await coordinator.start(initial.revision, destination);
  } else {
    const result = await coordinator.recoverOnStartup();
    const snapshot = result?.status === "recovery-required" ? null : await bootstrap.readSnapshot();
    send({ kind: "recovered", result, closed: barrier.isClosed(), dataRoot: snapshot?.configuration.dataRoot });
  }
} catch (error) {
  send({ kind: "error", message: error instanceof Error ? error.message : String(error), closed: barrier.isClosed() });
}
