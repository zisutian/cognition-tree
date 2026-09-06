// SPDX-License-Identifier: GPL-3.0-or-later

import type { WriteAdmissionPort } from "../../../application/runtime/index.ts";
import { CodexDeviceLoginOperations } from "../../../application/agentHost/index.ts";
import { createDeviceLoginProcessPort } from "../agent/index.ts";
import { serverApplicationScheduler } from "../platform/index.ts";

type ApplicationInput = ConstructorParameters<typeof CodexDeviceLoginOperations>[0];

export function createServerDeviceLoginOperations(input: Pick<ApplicationInput, "configurationStore" | "runtime" | "ttlMilliseconds"> & {
  projectRoot: string;
  writes: WriteAdmissionPort;
  cleanupDirectory?: (directory: string) => Promise<void>;
}) {
  return new CodexDeviceLoginOperations({
    configurationStore: {
      reserveProviderChange: (...args) => input.writes.run(() => input.configurationStore.reserveProviderChange(...args)),
      prepareCodexDeviceLogin: (...args) => input.writes.run(() => input.configurationStore.prepareCodexDeviceLogin(...args)),
      removeCodexDeviceLoginStaging: (...args) => input.writes.run(() => input.configurationStore.removeCodexDeviceLoginStaging(...args)),
      completeCodexDeviceLogin: (...args) => input.writes.run(() => input.configurationStore.completeCodexDeviceLogin(...args)),
    },
    runtime: input.runtime,
    ttlMilliseconds: input.ttlMilliseconds,
    processes: createDeviceLoginProcessPort(input),
    scheduler: serverApplicationScheduler,
  });
}
