// SPDX-License-Identifier: GPL-3.0-or-later

import { WriteAdmissionClosedError, type WriteCoordinationPort } from "../../../../application/runtime/index.ts";
import type { SystemMaintenancePort } from "../../../../application/system/index.ts";
import { ApiRequestError } from "../protocol/index.ts";

// These control operations read established control state and never enter a
// data-root store. Bearer authentication is disabled while the gate is closed.
const maintenanceControlOperations = new Set([
  "getOwnerSession", "createOwnerSession", "getSystemConfiguration",
  "getCurrentDataRootMigration", "getDataRootMigration", "reconcileDataRootMigration",
]);

export class ApiMaintenanceGate implements SystemMaintenancePort {
  readonly writes: WriteCoordinationPort;
  constructor(writes: WriteCoordinationPort) { this.writes = writes; }

  async run<Result>(operationId: string | undefined, operation: () => Promise<Result>) {
    if (operationId && maintenanceControlOperations.has(operationId)) return operation();
    try { return await this.writes.run(operation); }
    catch (error) {
      if (!(error instanceof WriteAdmissionClosedError)) throw error;
      throw new ApiRequestError("repository_busy", "Cognition Tree is migrating its data root");
    }
  }

  begin() { return this.writes.begin(); }
  isClosed() { return this.writes.isClosed(); }

}
