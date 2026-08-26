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
  ApiCreatedTrustedClientTokenDto,
  ApiWorkspaceTreeDto,
} from "../../../../contracts/api/types.ts";
import type { RepositoryDescriptorDto } from "../../../../contracts/workspace/types.ts";
import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace/types.ts";
import { OperationLedger } from "../../../../infrastructure/server/operations/operationLedger.ts";
import {
  createContent,
  dispatch,
  withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v3 authorization", () => {
  it("accepts only the local repository create and delete wire shapes", async () => {
    await withHandler(async (_handler, _rootDir, authenticated) => {
      const ownerToken = "owner-token-with-at-least-32-characters";
      const handler = authenticated(ownerToken);
      const obsoleteCreate = await dispatch<{ code: string }>(handler, {
        body: {
          adapter: "remote",
          authentication: { type: "none" },
          content: createContent(),
          label: "旧远端仓库",
          url: "https://storage.example.test/repository",
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v3/admin/repositories",
      });

      expect(obsoleteCreate).toMatchObject({
        body: { code: "invalid_request" },
        statusCode: 400,
      });
      const created = await dispatch<RepositoryDescriptorDto>(handler, {
        body: { content: createContent(), label: "本地仓库" },
        method: "POST",
        token: ownerToken,
        url: "/api/v3/admin/repositories",
      });
      const obsoleteDelete = await dispatch<{ code: string }>(handler, {
        method: "DELETE",
        token: ownerToken,
        url: `/api/v3/admin/repositories/${created.body!.id}?mode=legacy`,
      });

      expect(obsoleteDelete).toMatchObject({
        body: { code: "invalid_request" },
        statusCode: 400,
      });
      const deleted = await dispatch<never>(handler, {
        method: "DELETE",
        token: ownerToken,
        url: `/api/v3/admin/repositories/${created.body!.id}`,
      });

      expect(deleted).toEqual({
        body: null,
        headers: expect.any(Object),
        statusCode: 204,
      });
    });
  });

  it("keeps automation read-only, repository-scoped, and separate from old state", async () => {
    await withHandler(async (_handler, rootDir, authenticated) => {
      const ownerToken = "owner-token-with-at-least-32-characters";
      const handler = authenticated(ownerToken);
      const createRepository = (label: string) =>
        dispatch<RepositoryDescriptorDto>(handler, {
          body: { content: createContent(), label },
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

  it("grants trusted clients content sync but no owner authority", async () => {
    await withHandler(async (_handler, rootDir, authenticated) => {
      const ownerToken = "owner-token-with-at-least-32-characters";
      const handler = authenticated(ownerToken);
      const repository = await dispatch<RepositoryDescriptorDto>(handler, {
        body: { content: createContent(), label: "可信同步仓库" },
        method: "POST",
        token: ownerToken,
        url: "/api/v3/admin/repositories",
      });
      const created = await dispatch<ApiCreatedTrustedClientTokenDto>(handler, {
        body: { name: "每日 Codex" },
        method: "POST",
        token: ownerToken,
        url: "/api/v3/admin/trusted-client-tokens",
      });

      expect(created.statusCode).toBe(201);
      expect(created.body!.secret).toMatch(/^ctt_/);
      const secret = created.body!.secret;
      const capabilities = await dispatch<{
        operationAuditStatus: string;
        principal: { kind: string };
      }>(handler, {
        method: "GET",
        token: secret,
        url: "/api/v3/capabilities",
      });

      expect(capabilities.body).toMatchObject({
        operationAuditStatus: "unavailable",
        principal: { kind: "trusted-client" },
      });
      await expect(dispatch(handler, {
        method: "GET",
        token: secret,
        url: `/api/v3/sync/workspaces/${repository.body!.id}`,
      })).resolves.toMatchObject({ statusCode: 200 });
      for (const url of [
        "/api/v3/admin/repositories",
        "/api/v3/agent/status",
        "/api/v3/auth/session",
      ]) {
        const response = await dispatch<{ code?: string; authenticated?: boolean }>(handler, {
          method: "GET",
          token: secret,
          url,
        });

        if (url === "/api/v3/auth/session") {
          expect(response).toMatchObject({
            body: { authenticated: false },
            statusCode: 200,
          });
        } else {
          expect(response).toMatchObject({
            body: { code: "forbidden" },
            statusCode: 403,
          });
        }
      }
      const snapshot = await dispatch<{ content: unknown; revision: string }>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v3/sync/workspaces/${repository.body!.id}`,
      });
      await expect(dispatch<{ code: string }>(handler, {
        body: {
          base: snapshot.body,
          content: snapshot.body!.content,
        },
        method: "PUT",
        token: secret,
        url: `/api/v3/sync/workspaces/${repository.body!.id}`,
      })).resolves.toMatchObject({
        body: { code: "operation_audit_unavailable" },
        statusCode: 503,
      });
      const tokenFile = path.join(
        rootDir,
        "server-state/access-v1/trusted-client-tokens.json",
      );

      expect((await lstat(tokenFile)).mode & 0o777).toBe(0o600);
      expect(await readFile(tokenFile, "utf8")).not.toContain(secret);
      await expect(dispatch(handler, {
        method: "DELETE",
        token: ownerToken,
        url: `/api/v3/admin/trusted-client-tokens/${created.body!.token.id}`,
      })).resolves.toMatchObject({ statusCode: 200 });
      await expect(dispatch(handler, {
        method: "GET",
        token: secret,
        url: "/api/v3/capabilities",
      })).resolves.toMatchObject({ statusCode: 401 });
    });
  });

  it("audits a trusted-client sync before and after the content CAS", async () => {
    await withHandler(async (_handler, rootDir, authenticated) => {
      const ownerToken = "owner-token-with-at-least-32-characters";
      const ledger = new OperationLedger(path.join(rootDir, "server-state"), 100);

      await ledger.initialize();
      const handler = authenticated(ownerToken, { operationLedger: ledger });
      const repository = await dispatch<RepositoryDescriptorDto>(handler, {
        body: { content: createContent(), label: "受审计同步" },
        method: "POST",
        token: ownerToken,
        url: "/api/v3/admin/repositories",
      });
      const created = await dispatch<ApiCreatedTrustedClientTokenDto>(handler, {
        body: { name: "可信 Codex" },
        method: "POST",
        token: ownerToken,
        url: "/api/v3/admin/trusted-client-tokens",
      });
      const snapshot = await dispatch<{
        content: WorkspaceRepositoryContentDto;
        revision: `sha256:${string}`;
      }>(handler, {
        method: "GET",
        token: created.body!.secret,
        url: `/api/v3/sync/workspaces/${repository.body!.id}`,
      });
      const content = {
        ...snapshot.body!.content,
        workspace: {
          ...snapshot.body!.content.workspace,
          name: "可信客户端已同步",
        },
      };
      const committed = await dispatch<{
        outcome: string;
        snapshot: { revision: string };
      }>(handler, {
        body: { base: snapshot.body, content },
        method: "PUT",
        token: created.body!.secret,
        url: `/api/v3/sync/workspaces/${repository.body!.id}`,
      });

      expect(committed).toMatchObject({
        body: { outcome: "committed" },
        statusCode: 200,
      });
      const conflicted = await dispatch<{ code: string }>(handler, {
        body: {
          base: snapshot.body,
          content: {
            ...snapshot.body!.content,
            workspace: {
              ...snapshot.body!.content.workspace,
              name: "与远端重叠的名称",
            },
          },
        },
        method: "PUT",
        token: created.body!.secret,
        url: `/api/v3/sync/workspaces/${repository.body!.id}`,
      });

      expect(conflicted).toMatchObject({
        body: { code: "merge_conflict" },
        statusCode: 409,
      });
      const operations = await dispatch<{
        entries: Array<{
          afterRevision: string;
          principalId: string;
          result: string;
          source: string;
        }>;
      }>(handler, {
        method: "GET",
        token: ownerToken,
        url: "/api/v3/admin/operations",
      });

      expect(operations.body!.entries).toEqual([
        expect.objectContaining({
          afterRevision: null,
          principalId: created.body!.token.id,
          result: "conflict",
          source: "trusted-client",
        }),
        expect.objectContaining({
          afterRevision: committed.body!.snapshot.revision,
          principalId: created.body!.token.id,
          result: "committed",
          source: "trusted-client",
        }),
      ]);
    });
  });
});
