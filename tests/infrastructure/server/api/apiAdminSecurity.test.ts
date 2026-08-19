// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  lstat,
  readFile,
  readdir,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  ApiCommandResultDto,
  ApiCreatedTokenDto,
  ApiWorkspaceTreeDto,
} from "../../../../contracts/api/types.ts";
import type {
  RepositoryDescriptorDto,
} from "../../../../contracts/workspace/types.ts";
import {
  commandId,
  createContent,
  dispatch,
  dispatchRaw,
  withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v2", () => {
  it("issues scoped automation tokens, audits commits and streams checkpoints", async () => {
    await withHandler(async (_handler, rootDir, authenticated) => {
      const ownerToken = "owner-token-with-at-least-32-characters";
      const handler = authenticated(ownerToken);
      const repository = await dispatch<RepositoryDescriptorDto>(handler, {
        body: {
          adapter: "local",
          content: createContent(),
          label: "受控仓库",
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v2/admin/repositories",
      });
      const otherRepository = await dispatch<RepositoryDescriptorDto>(
        handler,
        {
          body: {
            adapter: "local",
            content: createContent(),
            label: "未授权仓库",
          },
          method: "POST",
          token: ownerToken,
          url: "/api/v2/admin/repositories",
        },
      );
      const createdToken = await dispatch<ApiCreatedTokenDto>(handler, {
        body: {
          name: "AI 工具",
          repositoryIds: [repository.body!.id],
          scopes: ["workspace:read", "workspace:write"],
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v2/admin/tokens",
      });
      const secret = createdToken.body!.secret;
      const capabilities = await dispatch<{
        principal: { kind: string; name: string };
      }>(handler, {
        method: "GET",
        token: secret,
        url: "/api/v2/capabilities",
      });

      expect(capabilities.body?.principal).toMatchObject({
        kind: "automation",
        name: "AI 工具",
      });
      const forbidden = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: secret,
        url: "/api/v2/journal/entries",
      });

      expect(forbidden).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
      const disallowedRepository = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v2/workspaces/${otherRepository.body!.id}/tree`,
      });
      const privilegedSnapshot = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v2/sync/workspaces/${repository.body!.id}`,
      });

      expect(disallowedRepository).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
      expect(privilegedSnapshot).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
      const tree = await dispatch<ApiWorkspaceTreeDto>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v2/workspaces/${repository.body!.id}/tree`,
      });
      const events = await dispatchRaw(handler, {
        method: "GET",
        token: secret,
        url: "/api/v2/events",
      });
      const createFolderCommand = {
        commandId: commandId(20),
        command: {
          kind: "create-folder",
          parentFolderId: null,
          title: "AI 文件夹",
        },
        mode: "commit",
        preconditions: { expectedTreeVersion: tree.body!.version },
      };
      const [createdFolder, replayedFolder] = await Promise.all([
        dispatch<ApiCommandResultDto>(handler, {
          body: createFolderCommand,
          method: "POST",
          token: secret,
          url: `/api/v2/workspaces/${repository.body!.id}/commands`,
        }),
        dispatch<ApiCommandResultDto>(handler, {
          body: createFolderCommand,
          method: "POST",
          token: secret,
          url: `/api/v2/workspaces/${repository.body!.id}/commands`,
        }),
      ]);

      expect(replayedFolder.body).toEqual(createdFolder.body);
      const updatedTree = await dispatch<ApiWorkspaceTreeDto>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v2/workspaces/${repository.body!.id}/tree`,
      });
      const deleteWithoutScope = await dispatch<{ code: string }>(handler, {
        body: {
          commandId: commandId(21),
          command: {
            folderId: createdFolder.body?.result.kind === "folder-created"
              ? createdFolder.body.result.folderId
              : "",
            kind: "delete-folder",
          },
          mode: "commit",
          preconditions: { expectedTreeVersion: updatedTree.body!.version },
        },
        method: "POST",
        token: secret,
        url: `/api/v2/workspaces/${repository.body!.id}/commands`,
      });

      expect(deleteWithoutScope).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
      const audit = await dispatch<{
        entries: Array<{ commandId: string; principalId: string }>;
      }>(handler, {
        method: "GET",
        token: ownerToken,
        url: "/api/v2/admin/audit",
      });

      expect(audit.body!.entries[0]).toMatchObject({
        commandId: commandId(20),
        principalId: createdToken.body!.token.id,
      });
      expect(
        audit.body!.entries.filter(({ commandId: id }) =>
          id === commandId(20)
        ),
      ).toHaveLength(1);
      expect(JSON.stringify(audit.body)).not.toContain(secret);
      expect(JSON.stringify(audit.body)).not.toContain("AI 文件夹");

      expect(events.statusCode).toBe(200);
      expect(events.headers["content-type"]).toContain("text/event-stream");
      expect(events.body).toContain("event: checkpoint");
      expect(events.body).toContain("event: change");
      expect(events.body).toContain('"changes"');
      expect(events.body).not.toContain("editableText");
      const streamed = events.body
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) =>
          JSON.parse(line.slice("data: ".length)) as {
            checkpoint: { streamId: string };
            streamId: string;
          }
        );

      expect(streamed).toHaveLength(2);
      expect(streamed.every(({ checkpoint, streamId }) =>
        checkpoint.streamId === streamId &&
        streamId === streamed[0]!.streamId
      )).toBe(true);
      const stateDirectory = path.join(rootDir, "server-state");
      const apiStateDirectory = path.join(stateDirectory, "api-v1");
      const tokenFile = path.join(apiStateDirectory, "tokens.json");
      const receiptFile = path.join(apiStateDirectory, "receipts.json");
      const auditFile = path.join(apiStateDirectory, "audit.json");

      expect((await lstat(apiStateDirectory)).mode & 0o777).toBe(0o700);
      expect((await readdir(apiStateDirectory)).sort()).toEqual([
        "audit.json",
        "receipts.json",
        "tokens.json",
      ]);
      for (const file of [auditFile, receiptFile, tokenFile]) {
        expect((await lstat(file)).mode & 0o777).toBe(0o600);
      }
      const receipts = await readFile(receiptFile, "utf8");

      expect(receipts).not.toContain("AI 文件夹");
      expect(receipts).not.toContain('"diff"');
      await utimes(tokenFile, new Date(0), new Date(0));
      await dispatch(handler, {
        method: "GET",
        token: secret,
        url: "/api/v2/capabilities",
      });
      expect((await lstat(tokenFile)).mtimeMs).toBe(0);
      const revoked = await dispatch<{ revoked: boolean }>(handler, {
        method: "DELETE",
        token: ownerToken,
        url: `/api/v2/admin/tokens/${createdToken.body!.token.id}`,
      });

      expect(revoked).toMatchObject({
        body: { revoked: true },
        statusCode: 200,
      });
      expect(events.ended).toBe(true);
      const afterRevocation = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: secret,
        url: "/api/v2/capabilities",
      });

      expect(afterRevocation).toMatchObject({
        body: { code: "unauthorized" },
        statusCode: 401,
      });
      const recoveryToken = await dispatch<ApiCreatedTokenDto>(handler, {
        body: {
          name: "隔离验证",
          repositoryIds: null,
          scopes: ["workspace:read"],
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v2/admin/tokens",
      });

      await writeFile(auditFile, "{invalid", "utf8");
      const reopened = authenticated(ownerToken);
      const isolatedTokens = await dispatch<{ tokens: ApiCreatedTokenDto[] }>(
        reopened,
        {
          method: "GET",
          token: ownerToken,
          url: "/api/v2/admin/tokens",
        },
      );
      const isolatedAuthentication = await dispatch(reopened, {
        method: "GET",
        token: recoveryToken.body!.secret,
        url: "/api/v2/capabilities",
      });
      const corruptAudit = await dispatch<{ code: string }>(reopened, {
        method: "GET",
        token: ownerToken,
        url: "/api/v2/admin/audit",
      });

      expect(isolatedTokens.statusCode).toBe(200);
      expect(isolatedAuthentication.statusCode).toBe(200);
      expect(corruptAudit).toMatchObject({
        body: { code: "internal_error" },
        statusCode: 500,
      });
    });
  });
});
