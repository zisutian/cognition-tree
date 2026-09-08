// SPDX-License-Identifier: GPL-3.0-or-later

import {
mkdir,
readFile,
writeFile
} from "node:fs/promises";
import path from "node:path";
import { describe,expect,it } from "vitest";
import type { RepositoryDescriptorDto } from "../../../../contracts/workspace/types.ts";
import {
createContent,
dispatch,
withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v4 authorization", () => {
  it("accepts only the local repository create and delete wire shapes", async () => {
    await withHandler(async (_handler, _rootDir, authenticated) => {
      const handler = authenticated();
      const obsoleteCreate = await dispatch<{ code: string }>(handler, {
        body: {
          adapter: "remote",
          authentication: { type: "none" },
          content: createContent(),
          label: "旧远端仓库",
          url: "https://storage.example.test/repository",
        },
        method: "POST",
        url: "/api/v4/admin/repositories",
      });

      expect(obsoleteCreate).toMatchObject({
        body: { code: "invalid_request" },
        statusCode: 400,
      });
      const created = await dispatch<RepositoryDescriptorDto>(handler, {
        body: { content: createContent(), label: "本地仓库" },
        method: "POST",
        url: "/api/v4/admin/repositories",
      });
      const obsoleteDelete = await dispatch<{ code: string }>(handler, {
        method: "DELETE",
        url: `/api/v4/admin/repositories/${created.body!.id}?mode=legacy`,
      });

      expect(obsoleteDelete).toMatchObject({
        body: { code: "invalid_request" },
        statusCode: 400,
      });
      const deleted = await dispatch<never>(handler, {
        method: "DELETE",
        url: `/api/v4/admin/repositories/${created.body!.id}`,
      });

      expect(deleted).toEqual({
        body: null,
        headers: expect.any(Object),
        statusCode: 204,
      });
    });
  });

  it("retires token administration and never reads or mutates legacy token files", async () => {
    await withHandler(async (handler, rootDirectory, configured) => {
      const directory = path.join(rootDirectory, "server-state", "access-v1");
      await mkdir(directory, { recursive: true });
      for (const name of ["automation-tokens.json", "trusted-client-tokens.json"]) await writeFile(path.join(directory, name), "legacy opaque state: never parse");
      const restarted = configured();
      expect((await dispatch(restarted, { method: "GET", url: "/api/v4/capabilities" })).statusCode).toBe(200);
      for (const suffix of ["automation-tokens", "trusted-client-tokens"]) {
        expect((await dispatch(handler, { method: "GET", url: `/api/v4/admin/${suffix}` })).statusCode).toBe(404);
        expect((await dispatch(handler, { method: "POST", url: `/api/v4/admin/${suffix}`, body: { name: "legacy" } })).statusCode).toBe(404);
      }
      for (const token of ["ctn_old-automation", "ctnt_old-trusted"]) {
        for (const url of ["/api/v4/capabilities", "/api/v4/workspaces", "/api/v4/sync/journal", "/api/v4/admin/system-configuration"]) {
          expect((await dispatch(handler, { method: "GET", url, token })).statusCode).toBe(401);
        }
      }
      for (const name of ["automation-tokens.json", "trusted-client-tokens.json"]) expect(await readFile(path.join(directory, name), "utf8")).toBe("legacy opaque state: never parse");
    });
  });
});
