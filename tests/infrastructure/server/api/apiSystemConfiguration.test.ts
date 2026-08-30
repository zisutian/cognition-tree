// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ApiOwnerCredentialRotationPreparationDto,
  ApiSystemConfigurationSnapshotDto,
} from "../../../../contracts/api/schemas/system.ts";
import { OperationLedger } from "../../../../infrastructure/server/operations/operationLedger.ts";
import { createApiRequestHandler } from "../../../../infrastructure/server/api/http/server.ts";
import { createApiSecurityPolicy } from "../../../../infrastructure/server/api/http/security.ts";
import { LocalRepositoryCatalog } from "../../../../infrastructure/server/repository/workspace/local/localRepositoryCatalog.ts";
import { BootstrapConfigurationStore } from "../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import { SystemAdministrationService } from "../../../../infrastructure/server/system/systemAdministrationService.ts";
import { dispatch } from "./support/apiServerTestHarness.ts";

describe("system configuration API", () => {
  it("owns configuration CAS, two-stage owner rotation, and session cookies", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-system-api-"));
    const bootstrap = new BootstrapConfigurationStore(root);
    const initial = await bootstrap.readSnapshot();
    const catalog = new LocalRepositoryCatalog(
      path.join(initial.configuration.dataRoot, "repositories"),
    );

    await catalog.initialize();
    try {
      const ledger = new OperationLedger(
        path.join(initial.configuration.dataRoot, "server"),
        initial.configuration.maxAuditEntries,
      );
      const administration = new SystemAdministrationService({
        bootstrap,
        effectiveConfiguration: initial.configuration,
        ledger,
        migrations: {
          get: async () => { throw new Error("not used"); },
          start: async () => { throw new Error("not used"); },
        },
      });
      const handler = createApiRequestHandler({
        catalog,
        operationLedger: ledger,
        security: createApiSecurityPolicy({
          ownerSessions: bootstrap,
          port: 3_001,
          publicOrigin: null,
        }),
        stateDirectory: path.join(initial.configuration.dataRoot, "server"),
        systemAdministration: administration,
      });
      const auditStatus = await dispatch<{ status: string }>(handler, {
        method: "GET",
        url: "/api/v3/admin/operations/status",
      });
      const operations = await dispatch<{ entries: unknown[] }>(handler, {
        method: "GET",
        url: "/api/v3/admin/operations",
      });

      expect(auditStatus).toMatchObject({
        body: { status: "available" },
        statusCode: 200,
      });
      expect(operations).toMatchObject({
        body: { entries: [] },
        statusCode: 200,
      });
      await expect(dispatch(handler, {
        method: "GET",
        url: "/api/v3/admin/agent-operations",
      })).resolves.toMatchObject({ statusCode: 404 });
      const loaded = await dispatch<ApiSystemConfigurationSnapshotDto>(handler, {
        method: "GET",
        url: "/api/v3/admin/system-configuration",
      });
      const preparation = await dispatch<
        ApiOwnerCredentialRotationPreparationDto
      >(handler, {
        body: { baseRevision: loaded.body!.revision },
        method: "POST",
        url: "/api/v3/admin/system-configuration/owner-credential/rotations",
      });

      expect(preparation.statusCode).toBe(201);
      expect(preparation.body!.secret).toMatch(/^ctn_owner_/);
      expect(preparation.body!.rotationId).toBeTruthy();
      expect(preparation.body!.configuration).toMatchObject({
        ownerCredentialConfigured: false,
        ownerCredentialRotationPending: true,
      });
      expect(preparation.headers["set-cookie"]).toBeUndefined();
      const pendingLogin = await dispatch<{ code: string }>(handler, {
        body: { secret: preparation.body!.secret },
        method: "POST",
        url: "/api/v3/auth/session",
      });

      expect(pendingLogin).toMatchObject({
        body: { code: "unauthorized" },
        statusCode: 401,
      });
      const activationWithoutProof = await dispatch<{ code: string }>(
        handler,
        {
          body: {
            baseRevision: preparation.body!.configuration.revision,
            rotationId: preparation.body!.rotationId,
            secret: "not-the-prepared-secret",
          },
          method: "POST",
          url: "/api/v3/admin/system-configuration/owner-credential/activations",
        },
      );

      expect(activationWithoutProof).toMatchObject({
        body: { code: "domain_validation_failed" },
        statusCode: 422,
      });
      const activated = await dispatch<ApiSystemConfigurationSnapshotDto>(
        handler,
        {
          body: {
            baseRevision: preparation.body!.configuration.revision,
            rotationId: preparation.body!.rotationId,
            secret: preparation.body!.secret,
          },
          method: "POST",
          url: "/api/v3/admin/system-configuration/owner-credential/activations",
        },
      );

      expect(activated.statusCode).toBe(200);
      expect(activated.body).toMatchObject({
        ownerCredentialConfigured: true,
        ownerCredentialRotationPending: false,
      });
      expect(activated.headers["set-cookie"]).toContain("HttpOnly");
      expect(activated.headers["set-cookie"]).toContain("SameSite=Strict");
      expect(activated.headers["set-cookie"]).toContain("Secure");
      expect(activated.headers["set-cookie"]).toContain("Path=/api/v3");
      const invalidLogin = await dispatch<{ code: string }>(handler, {
        body: { secret: "wrong" },
        method: "POST",
        url: "/api/v3/auth/session",
      });

      expect(invalidLogin).toMatchObject({
        body: { code: "unauthorized" },
        statusCode: 401,
      });
      const login = await dispatch<{ authenticated: boolean }>(handler, {
        body: { secret: preparation.body!.secret },
        method: "POST",
        url: "/api/v3/auth/session",
      });

      expect(login).toMatchObject({ body: { authenticated: true }, statusCode: 200 });
      expect(login.headers["set-cookie"]).not.toContain(preparation.body!.secret);
      const updated = await dispatch<ApiSystemConfigurationSnapshotDto>(handler, {
        body: {
          baseRevision: activated.body!.revision,
          configuration: {
            listenMode: "lan",
            maxAuditEntries: 25,
            port: 4_001,
            publicOrigin: "https://tree.example.test",
            repositoryHostRoot: null,
          },
        },
        method: "PATCH",
        url: "/api/v3/admin/system-configuration",
      });

      expect(updated.body).toMatchObject({
        configuration: { listenMode: "lan", maxAuditEntries: 25, port: 4_001 },
        effectiveConfiguration: { listenMode: "loopback", maxAuditEntries: 25, port: 3_001 },
        restartRequired: true,
      });
      const stale = await dispatch<{ code: string }>(handler, {
        body: {
          baseRevision: activated.body!.revision,
          configuration: {
            listenMode: "loopback",
            maxAuditEntries: 1_000,
            port: 3_001,
            publicOrigin: null,
            repositoryHostRoot: null,
          },
        },
        method: "PATCH",
        url: "/api/v3/admin/system-configuration",
      });

      expect(stale).toMatchObject({ body: { code: "resource_conflict" }, statusCode: 409 });
    } finally {
      await catalog.dispose();
      await rm(root, { force: true, recursive: true });
    }
  });
});
