// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createRepository,
  dispatch,
  withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v4 registry", () => {
  it("derives unique v3 routes, access policy, OpenAPI, and owner sync", async () => {
    await withHandler(async (handler) => {
      await expect(dispatch<{ ok: boolean }>(handler, {
        method: "GET",
        url: "/api/v4/health",
      })).resolves.toMatchObject({ body: { ok: true }, statusCode: 200 });
      for (const oldPath of ["/api/v1/health", "/api/v2/health"]) {
        await expect(dispatch<{ code: string }>(handler, {
          method: "GET",
          url: oldPath,
        })).resolves.toMatchObject({
          body: { code: "not_found" },
          statusCode: 404,
        });
      }
      await expect(dispatch<{ apiVersion: number }>(handler, {
        method: "GET",
        url: "/api/v4/capabilities",
      })).resolves.toMatchObject({
        body: { apiVersion: 4 },
        statusCode: 200,
      });
      const openapi = await dispatch<Record<string, unknown>>(handler, {
        method: "GET",
        url: "/api/v4/openapi.json",
      });

      expect(openapi.body).toMatchObject({
        info: { version: "4.0.0" },
        openapi: "3.1.0",
      });
      const paths = openapi.body!.paths as Record<
        string,
        Record<string, {
          operationId: string;
          responses: Record<string, unknown>;
          "x-ctn-access": { kind: string };
        }>
      >;
      const operations = Object.entries(paths).flatMap(([route, methods]) =>
        Object.values(methods).map((operation) => ({ operation, route }))
      );

      expect(Object.keys(paths).every((route) => route.startsWith("/api/v4/")))
        .toBe(true);
      expect(Object.keys(paths).some((route) => route.includes("commands")))
        .toBe(false);
      expect(
        new Set(operations.map(({ operation }) => operation.operationId)).size,
      ).toBe(operations.length);
      for (const { operation } of operations.filter(({ route }) =>
        route.startsWith("/api/v4/admin/") ||
        route.startsWith("/api/v4/agent/")
      )) {
        expect(operation["x-ctn-access"]).toEqual({ kind: "owner" });
      }
      for (const { operation } of operations.filter(({ route }) =>
        route.startsWith("/api/v4/sync/")
      )) {
        expect(operation["x-ctn-access"]).toEqual({ kind: "content-sync" });
      }
      expect(paths["/api/v4/content/search"]!.post["x-ctn-access"])
        .toEqual({ domain: "any", kind: "content-read" });
      expect(paths["/api/v4/admin/automation-tokens"]!.post.responses)
        .toMatchObject({ "201": expect.any(Object) });
      expect(
        paths["/api/v4/admin/agent-profiles/{profileId}/conformance-checks"]!
          .post.responses,
      ).toMatchObject({ "202": expect.any(Object) });
      expect(paths["/api/v4/admin/agent-profiles/{profileId}/conformance-check"])
        .toBeUndefined();
      expect(
        paths[
          "/api/v4/admin/agent-providers/{providerId}/codex-device-logins"
        ]!.post.responses,
      ).toMatchObject({ "202": expect.any(Object) });
      expect(
        paths["/api/v4/admin/agent-codex-device-logins/{codexLoginId}"]!
          .delete["x-ctn-access"],
      ).toEqual({ kind: "owner" });
      expect(
        paths[
          "/api/v4/admin/system-configuration/owner-credential/rotations"
        ]!.post.responses,
      ).toMatchObject({ "201": expect.any(Object) });
      expect(
        paths[
          "/api/v4/admin/system-configuration/owner-credential/activations"
        ]!.post["x-ctn-access"],
      ).toEqual({ kind: "owner" });
      expect(
        paths["/api/v4/admin/system-configuration/owner-credential"]!.post,
      ).toBeUndefined();

      await expect(dispatch<{ code: string }>(handler, {
        method: "GET",
        url: "/api/v4/admin/agent-conformance-checks/missing",
      })).resolves.toMatchObject({
        body: { code: "not_found" },
        statusCode: 404,
      });
      await expect(dispatch<{ code: string }>(handler, {
        method: "GET",
        url: "/api/v4/admin/agent-codex-device-logins/missing",
      })).resolves.toMatchObject({
        body: { code: "not_found" },
        statusCode: 404,
      });

      const repository = await createRepository(handler);
      const snapshot = await dispatch<{ revision: string }>(handler, {
        method: "GET",
        url: `/api/v4/sync/workspaces/${repository.id}`,
      });

      expect(snapshot.body?.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
  });
});
