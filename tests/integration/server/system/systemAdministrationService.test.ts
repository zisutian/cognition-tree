// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BootstrapConfigurationStore } from "../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import { SystemAdministrationService } from "../../../../application/system/systemAdministrationService.ts";

describe("system administration runtime projection", () => {
  it("returns the committed configuration when applying the audit capacity fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-system-apply-"));

    try {
      const bootstrap = new BootstrapConfigurationStore(root);
      const initial = await bootstrap.readSnapshot();
      let rejectCapacity = true;
      const updateMaximumEntries = vi.fn(async () => {
        if (rejectCapacity) throw new Error("audit capacity update failed");
      });
      const administration = new SystemAdministrationService({
        bootstrap,
        effectiveConfiguration: initial.configuration,
        ledger: { updateMaximumEntries },
        migrations: {
            current: async () => null,
            reconcile: async () => { throw new Error("No migration to reconcile"); },
          get: async () => { throw new Error("not used"); },
          start: async () => { throw new Error("not used"); },
        },
      });
      const input = {
        listenMode: initial.configuration.listenMode,
        maxAuditEntries: 25,
        port: initial.configuration.port,
        publicOrigin: initial.configuration.publicOrigin,
        repositoryHostRoot: initial.configuration.repositoryHostRoot,
      };
      const committed = await administration.update(initial.revision, input);

      expect(committed).toMatchObject({
        configuration: { maxAuditEntries: 25 },
        effectiveConfiguration: {
          maxAuditEntries: initial.configuration.maxAuditEntries,
        },
        restartRequired: true,
        runtimeApplyErrorMessage: "audit capacity update failed",
      });
      await expect(bootstrap.readSnapshot()).resolves.toMatchObject({
        configuration: { maxAuditEntries: 25 },
        revision: committed.revision,
      });

      rejectCapacity = false;
      const recovered = await administration.update(committed.revision, input);

      expect(recovered).toMatchObject({
        configuration: { maxAuditEntries: 25 },
        effectiveConfiguration: { maxAuditEntries: 25 },
        restartRequired: false,
        runtimeApplyErrorMessage: null,
      });
      expect(updateMaximumEntries).toHaveBeenCalledTimes(2);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
