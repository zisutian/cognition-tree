// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  ApiCreatedTokenDto,
  ApiWorkspaceTreeDto,
} from "../../../../contracts/api/types.ts";
import type { RepositoryDescriptorDto } from "../../../../contracts/workspace/types.ts";
import {
  createContent,
  dispatch,
  withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v3 authorization", () => {
  it("keeps automation read-only, repository-scoped, and separate from old state", async () => {
    await withHandler(async (_handler, rootDir, authenticated) => {
      const ownerToken = "owner-token-with-at-least-32-characters";
      const handler = authenticated(ownerToken);
      const createRepository = (label: string) =>
        dispatch<RepositoryDescriptorDto>(handler, {
          body: { adapter: "local", content: createContent(), label },
          method: "POST",
          token: ownerToken,
          url: "/api/v3/admin/repositories",
        });
      const repository = await createRepository("受控仓库");
      const otherRepository = await createRepository("未授权仓库");
      const createdToken = await dispatch<ApiCreatedTokenDto>(handler, {
        body: {
          name: "只读工具",
          repositoryIds: [repository.body!.id],
          scopes: ["workspace:read"],
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v3/admin/automation-tokens",
      });

      expect(createdToken.statusCode).toBe(201);
      const secret = createdToken.body!.secret;
      const capabilities = await dispatch<{
        apiVersion: number;
        principal: { kind: string; name: string };
      }>(handler, {
        method: "GET",
        token: secret,
        url: "/api/v3/capabilities",
      });

      expect(capabilities.body).toMatchObject({
        apiVersion: 3,
        principal: { kind: "automation", name: "只读工具" },
      });
      const tree = await dispatch<ApiWorkspaceTreeDto>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v3/content/workspaces/${repository.body!.id}/tree`,
      });

      expect(tree.statusCode).toBe(200);
      for (const request of [
        {
          method: "GET",
          url: `/api/v3/content/workspaces/${otherRepository.body!.id}/tree`,
        },
        {
          method: "GET",
          url: `/api/v3/sync/workspaces/${repository.body!.id}`,
        },
        { method: "GET", url: "/api/v3/admin/repositories" },
        { method: "GET", url: "/api/v3/agent/status" },
      ]) {
        const response = await dispatch<{ code: string }>(handler, {
          ...request,
          token: secret,
        });

        expect(response).toMatchObject({
          body: { code: "forbidden" },
          statusCode: 403,
        });
      }
      const writeScope = await dispatch<{ code: string }>(handler, {
        body: {
          name: "旧写权限",
          repositoryIds: null,
          scopes: ["workspace:write"],
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v3/admin/automation-tokens",
      });

      expect(writeScope).toMatchObject({
        body: { code: "invalid_request" },
        statusCode: 400,
      });
      const oldRoute = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: ownerToken,
        url: "/api/v2/capabilities",
      });

      expect(oldRoute).toMatchObject({
        body: { code: "not_found" },
        statusCode: 404,
      });

      const stateDirectory = path.join(rootDir, "server-state");
      const accessDirectory = path.join(stateDirectory, "access-v1");
      const tokenFile = path.join(accessDirectory, "automation-tokens.json");

      expect((await lstat(accessDirectory)).mode & 0o777).toBe(0o700);
      expect(await readdir(accessDirectory)).toEqual(["automation-tokens.json"]);
      expect((await lstat(tokenFile)).mode & 0o777).toBe(0o600);
      expect(await readFile(tokenFile, "utf8")).not.toContain(secret);

      const oldDirectory = path.join(stateDirectory, "api-v1");

      await mkdir(oldDirectory, { recursive: true });
      await writeFile(path.join(oldDirectory, "tokens.json"), "{invalid", "utf8");
      await writeFile(path.join(oldDirectory, "audit.json"), "{invalid", "utf8");
      const reopened = authenticated(ownerToken);
      const tokens = await dispatch<{ tokens: unknown[] }>(reopened, {
        method: "GET",
        token: ownerToken,
        url: "/api/v3/admin/automation-tokens",
      });

      expect(tokens.statusCode).toBe(200);
      expect(tokens.body?.tokens).toHaveLength(1);
      const revoked = await dispatch<{ revoked: boolean }>(reopened, {
        method: "DELETE",
        token: ownerToken,
        url: `/api/v3/admin/automation-tokens/${createdToken.body!.token.id}`,
      });

      expect(revoked).toMatchObject({ body: { revoked: true }, statusCode: 200 });
      const afterRevocation = await dispatch<{ code: string }>(reopened, {
        method: "GET",
        token: secret,
        url: "/api/v3/capabilities",
      });

      expect(afterRevocation).toMatchObject({
        body: { code: "unauthorized" },
        statusCode: 401,
      });
    });
  });
});
