// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type {
  SystemConfigurationSnapshot,
} from "../../../../application/system";
import {
  activateSystemOwnerCredentialRotation,
  prepareSystemOwnerCredentialRotation,
} from "../../../../presentation/activities/settings/systemOwnerCredentialSession";

const preparedRevision = `sha256:${"a".repeat(64)}` as const;
const configuration: SystemConfigurationSnapshot = {
  configuration: {
    dataRoot: "/data/current",
    listenMode: "loopback",
    maxAuditEntries: 1_000,
    port: 3_001,
    publicOrigin: null,
    repositoryHostRoot: null,
  },
  effectiveConfiguration: {
    dataRoot: "/data/current",
    listenMode: "loopback",
    maxAuditEntries: 1_000,
    port: 3_001,
    publicOrigin: null,
    repositoryHostRoot: null,
  },
  ownerCredentialConfigured: true,
  ownerCredentialRotationPending: true,
  restartRequired: false,
  revision: preparedRevision,
  runtimeApplyErrorMessage: null,
  version: 2,
};

describe("system owner credential session", () => {
  it("retains the prepared secret and exact activation identity on failure", async () => {
    const snapshot = await prepareSystemOwnerCredentialRotation({
      prepareOwnerCredentialRotation: async () => ({
        configuration,
        rotationId: "rotation-1",
        secret: "ctn_owner_once",
      }),
    });
    const activateOwnerCredentialRotation = vi.fn(async () => {
      throw new Error("durable write outcome could not be verified");
    });

    await expect(activateSystemOwnerCredentialRotation(snapshot, {
      activateOwnerCredentialRotation,
    })).rejects.toThrow("durable write outcome could not be verified");
    expect(snapshot).toEqual({
      activationStatus: "awaiting-confirmation",
      preparation: {
        baseRevision: preparedRevision,
        rotationId: "rotation-1",
        secret: "ctn_owner_once",
      },
    });
    expect(activateOwnerCredentialRotation).toHaveBeenCalledWith({
      baseRevision: preparedRevision,
      rotationId: "rotation-1",
      secret: "ctn_owner_once",
    });
  });

  it("marks activation only after the activation request resolves", async () => {
    const snapshot = await prepareSystemOwnerCredentialRotation({
      prepareOwnerCredentialRotation: async () => ({
        configuration,
        rotationId: "rotation-1",
        secret: "ctn_owner_once",
      }),
    });
    const activated = await activateSystemOwnerCredentialRotation(snapshot, {
      activateOwnerCredentialRotation: async () => undefined,
    });

    expect(activated).toEqual({
      ...snapshot,
      activationStatus: "activated",
    });
    expect(activated.preparation?.secret).toBe("ctn_owner_once");
  });
});
