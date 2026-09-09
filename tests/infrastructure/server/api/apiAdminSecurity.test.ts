// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createRepository,
  dispatch,
  withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v4 authorization", () => {
  it("removes unversioned repository write routes", async () => {
    await withHandler(async (handler) => {
      const repository = await createRepository(handler);
      expect(
        (
          await dispatch(handler, {
            method: "POST",
            url: "/api/v4/admin/repositories",
            body: { label: "旧写入口" },
          })
        ).statusCode,
      ).toBe(405);
      for (const method of ["PATCH", "DELETE"]) {
        expect(
          (
            await dispatch(handler, {
              method,
              url: `/api/v4/admin/repositories/${repository.id}`,
            })
          ).statusCode,
        ).toBe(404);
      }
    });
  });

  it("retires token administration and never reads or mutates legacy token files", async () => {
    await withHandler(async (handler, rootDirectory, configured) => {
      const directory = path.join(rootDirectory, "server-state", "access-v1");
      await mkdir(directory, { recursive: true });
      for (const name of [
        "automation-tokens.json",
        "trusted-client-tokens.json",
      ])
        await writeFile(
          path.join(directory, name),
          "legacy opaque state: never parse",
        );
      const restarted = configured();
      expect(
        (
          await dispatch(restarted, {
            method: "GET",
            url: "/api/v4/capabilities",
          })
        ).statusCode,
      ).toBe(200);
      for (const suffix of ["automation-tokens", "trusted-client-tokens"]) {
        expect(
          (
            await dispatch(handler, {
              method: "GET",
              url: `/api/v4/admin/${suffix}`,
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await dispatch(handler, {
              method: "POST",
              url: `/api/v4/admin/${suffix}`,
              body: { name: "legacy" },
            })
          ).statusCode,
        ).toBe(404);
      }
      for (const token of ["ctn_old-automation", "ctnt_old-trusted"]) {
        for (const url of [
          "/api/v4/capabilities",
          "/api/v4/workspaces",
          "/api/v4/sync/journal",
          "/api/v4/admin/system-configuration",
        ]) {
          expect(
            (await dispatch(handler, { method: "GET", url, token })).statusCode,
          ).toBe(401);
        }
      }
      for (const name of [
        "automation-tokens.json",
        "trusted-client-tokens.json",
      ])
        expect(await readFile(path.join(directory, name), "utf8")).toBe(
          "legacy opaque state: never parse",
        );
    });
  });
});
