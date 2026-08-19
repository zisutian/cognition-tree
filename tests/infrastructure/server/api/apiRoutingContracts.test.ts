// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createRepository,
  dispatch,
  withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v2", () => {
  it("derives routing, OpenAPI, and sync from the operation registry", async () => {
    await withHandler(async (handler) => {
      await expect(
        dispatch<{ ok: boolean }>(handler, {
          method: "GET",
          url: "/api/v2/health",
        }),
      ).resolves.toMatchObject({
        body: { ok: true },
        statusCode: 200,
      });
      await expect(
        dispatch<{ code: string }>(handler, {
          method: "GET",
          url: "/api/v1/health",
        }),
      ).resolves.toMatchObject({
        body: { code: "not_found" },
        statusCode: 404,
      });
      await expect(
        dispatch<{ apiVersion: number }>(handler, {
          method: "GET",
          url: "/api/v2/capabilities",
        }),
      ).resolves.toMatchObject({
        body: { apiVersion: 2 },
        statusCode: 200,
      });
      const openapi = await dispatch<Record<string, unknown>>(handler, {
        method: "GET",
        url: "/api/v2/openapi.json",
      });

      expect(openapi.body).toMatchObject({
        info: { version: "2.0.0" },
        openapi: "3.1.0",
      });
      const paths = openapi.body!.paths as Record<
        string,
        Record<string, {
          operationId: string;
          "x-ctn-required-scopes": string[];
        }>
      >;
      const operations = Object.entries(paths).flatMap(([route, methods]) =>
        Object.values(methods).map((operation) => ({ operation, route }))
      );

      expect(Object.keys(paths).every((route) => route.startsWith("/api/v2/")))
        .toBe(true);
      const searchResponse = (
        paths["/api/v2/search"]!.post as unknown as {
          responses: Record<string, {
            content: Record<string, {
              schema: { required: string[] };
            }>;
          }>;
        }
      ).responses["200"]!.content["application/json"]!.schema;

      expect(searchResponse.required).toEqual(
        expect.arrayContaining(["cursor", "faults", "results"]),
      );

      expect(
        new Set(operations.map(({ operation }) => operation.operationId)).size,
      ).toBe(operations.length);
      for (const { operation } of operations.filter(({ route }) =>
        route.startsWith("/api/v2/admin/") ||
        route.startsWith("/api/v2/sync/")
      )) {
        expect(operation["x-ctn-required-scopes"]).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /^(repository:admin|sync|syntax:write|token:manage)$/,
            ),
          ]),
        );
      }
      expect(
        (
          paths["/api/v2/admin/tokens"]!.post as unknown as {
            responses: Record<string, unknown>;
          }
        ).responses,
      ).toMatchObject({ "201": expect.any(Object) });
      expect(
        (
          paths["/api/v2/admin/tokens"]!.post as unknown as {
            responses: Record<string, unknown>;
          }
        ).responses,
      ).not.toHaveProperty("200");
      const repository = await createRepository(handler);
      const snapshot = await dispatch<{ revision: string }>(handler, {
        method: "GET",
        url: `/api/v2/sync/workspaces/${repository.id}`,
      });

      expect(snapshot.body?.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
  });
});
