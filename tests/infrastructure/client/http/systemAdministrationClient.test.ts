// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHttpSystemAdministrationClient,
} from "../../../../infrastructure/client/http/systemAdministrationClient.ts";

const preparedRevision = `sha256:${"a".repeat(64)}`;
const activatedRevision = `sha256:${"b".repeat(64)}`;
const systemConfiguration = {
  dataRoot: "/data/current",
  listenMode: "loopback" as const,
  maxAuditEntries: 1_000,
  port: 3_001,
  publicOrigin: null,
  repositoryHostRoot: null,
};
const snapshot = (revision: string, pending: boolean) => ({
  configuration: systemConfiguration,
  effectiveConfiguration: systemConfiguration,
  ownerCredentialConfigured: !pending,
  ownerCredentialRotationPending: pending,
  restartRequired: false,
  revision,
  runtimeApplyErrorMessage: null,
  version: pending ? 2 : 3,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTTP system administration client", () => {
  it("uses separate prepare and activate contracts with exact identities", async () => {
    const requests: Array<{
      body: unknown;
      method: string;
      url: string;
    }> = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) as unknown : null,
        method: init?.method ?? "GET",
        url: String(input),
      });
      return Response.json(
        String(input).endsWith("/rotations")
          ? {
              configuration: snapshot(preparedRevision, true),
              rotationId: "rotation-1",
              secret: "ctn_owner_once",
            }
          : snapshot(activatedRevision, false),
      );
    });

    vi.stubGlobal("fetch", fetch);
    const client = createHttpSystemAdministrationClient({
      baseUrl: "https://ctn.example",
    });
    const preparation = await client.prepareOwnerCredentialRotation(
      `sha256:${"0".repeat(64)}`,
    );
    const activated = await client.activateOwnerCredentialRotation(
      preparation.configuration.revision,
      preparation.rotationId,
      preparation.secret,
    );

    expect(activated.revision).toBe(activatedRevision);
    expect(requests).toEqual([{
      body: { baseRevision: `sha256:${"0".repeat(64)}` },
      method: "POST",
      url: "https://ctn.example/api/v3/admin/system-configuration/owner-credential/rotations",
    }, {
      body: {
        baseRevision: preparedRevision,
        rotationId: "rotation-1",
        secret: "ctn_owner_once",
      },
      method: "POST",
      url: "https://ctn.example/api/v3/admin/system-configuration/owner-credential/activations",
    }]);
  });
});
