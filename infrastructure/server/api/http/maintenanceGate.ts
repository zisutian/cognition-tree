// SPDX-License-Identifier: GPL-3.0-or-later

import { ApplicationWriteBarrier } from "../../../../application/runtime/index.ts";
import type { SystemMaintenancePort } from "../../../../application/system/index.ts";
import { ApiRequestError } from "../protocol/index.ts";

// These control operations read established control state and never enter a
// data-root store. Bearer authentication is disabled while the gate is closed.
const maintenanceControlOperations = new Set([
  "getOwnerSession", "createOwnerSession", "getSystemConfiguration",
  "getCurrentDataRootMigration", "getDataRootMigration", "reconcileDataRootMigration",
]);

export class ApiMaintenanceGate implements SystemMaintenancePort {
  readonly #barrier = new ApplicationWriteBarrier();

  begin() { return this.#barrier.begin(); }
  isClosed() { return this.#barrier.isClosed(); }

  enter(operationId: string | undefined) {
    if (operationId && maintenanceControlOperations.has(operationId)) return () => undefined;
    try { return this.#barrier.enter().finish; }
    catch {
      throw new ApiRequestError("repository_busy", "Cognition Tree is migrating its data root");
    }
  }
}
