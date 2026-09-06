// SPDX-License-Identifier: GPL-3.0-or-later

import { CodexDeviceLoginOperations } from "../../../application/agentHost/codexDeviceLoginOperations.ts";
import { createDeviceLoginProcessPort } from "../agent/deviceLoginProcess.ts";
import { serverApplicationScheduler } from "../platform/applicationScheduler.ts";

type ApplicationInput = ConstructorParameters<typeof CodexDeviceLoginOperations>[0];

export function createServerDeviceLoginOperations(input: Pick<ApplicationInput, "configurationStore" | "runtime" | "ttlMilliseconds"> & {
  projectRoot: string;
  cleanupDirectory?: (directory: string) => Promise<void>;
}) {
  return new CodexDeviceLoginOperations({
    configurationStore: input.configurationStore,
    runtime: input.runtime,
    ttlMilliseconds: input.ttlMilliseconds,
    processes: createDeviceLoginProcessPort(input),
    scheduler: serverApplicationScheduler,
  });
}
