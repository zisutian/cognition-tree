// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { ContentService } from "../../../../application/content/index.ts";
import {
  buildApiOperationPath,
  getApiOperation,
  parseApiOperationResponse,
  parseApiSchema,
  ContentQueryResultSchema,
  parseApiError,
} from "../../../../contracts/api/index.ts";
import { ContentOperationResultSchema } from "../../../../contracts/content/index.ts";
import { createApiServer } from "../../../../infrastructure/server/runtime/apiRuntime.ts";
import { createContentServiceFixture } from "../operations/contentServiceFixture.ts";

describe("local content API over HTTP", () => {
  it("uses registry routes, local access, compact reads, exact commands and durable result queries", async () => {
    const fixture = await createContentServiceFixture();
    let holdAfterCommit = false;
    let observeCommit!: () => void;
    let releaseCommit!: () => void;
    const committed = new Promise<void>((resolve) => {
      observeCommit = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const journal = await fixture.ports.journal();
    const service = new ContentService({
      ...fixture.ports,
      journal: async () => ({
        loadSnapshot: () => journal.loadSnapshot(),
        commit: async (input) => {
          const receipt = await journal.commit(input);
          if (holdAfterCommit) {
            observeCommit();
            await released;
          }
          return receipt;
        },
      }),
    });
    const server = createApiServer({
      contentService: service,
      catalog: fixture.catalog,
      builtInCatalog: fixture.builtIns,
      operationLedger: fixture.ledger,
      runtime: fixture.ports.runtime,
      stateDirectory: `${fixture.root}/http-state`,
      security: {
        allowedHosts: ["127.0.0.1"],
        allowedOrigins: [],
        publicOrigin: null,
        ownerSessions: {
          createOwnerSessionForSecret: async () => null,
          verifyOwnerSession: async () => false,
        },
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    async function request(
      operationId: string,
      body?: unknown,
      operation?: string,
      headers: Record<string, string> = {},
      signal?: AbortSignal,
    ) {
      const definition = getApiOperation(operationId);
      const sent = body === undefined ? undefined : JSON.stringify(body);
      const response = await fetch(
        `${origin}${buildApiOperationPath(operationId, operation ? { operationId: operation } : {})}`,
        {
          method: definition.method,
          headers: { "content-type": "application/json", ...headers },
          body: sent,
          signal,
        },
      );
      const received = await response.text();
      const parsed: unknown = JSON.parse(received);
      if (response.status >= 400) parseApiError(parsed);
      else parseApiOperationResponse(operationId, response.status, parsed);
      return { status: response.status, body: parsed, sent, received };
    }
    try {
      const catalog = parseApiSchema(
        ContentQueryResultSchema,
        (await request("queryLocalContent", { kind: "catalog" })).body,
      );
      const create = {
        operationId: randomUUID(),
        baseRevision: catalog.baseRevision,
        scope: { domain: "catalog" },
        command: { kind: "create-repository", name: "语义仓库" },
      };
      const created = await request("executeContentOperation", create);
      expect(created.status).toBe(200);
      expect(
        parseApiSchema(ContentOperationResultSchema, created.body),
      ).toMatchObject({ status: "committed", audit: "recorded" });
      expect((await request("executeContentOperation", create)).body).toEqual(
        created.body,
      );
      const scope = { domain: "workspace", repository: "语义仓库" };
      const directory = parseApiSchema(
        ContentQueryResultSchema,
        (await request("queryLocalContent", { kind: "directory", scope })).body,
      );
      const source =
        "- 修改目标\n" +
        Array.from(
          { length: 200 },
          (_, index) => `- 无关内容 ${index} 保留的详细说明`,
        ).join("\n");
      const createNote = await request("executeContentOperation", {
        operationId: randomUUID(),
        baseRevision: directory.baseRevision,
        scope,
        command: {
          kind: "create-note",
          parent: null,
          title: "进程",
          body: source,
        },
      });
      expect(createNote.status).toBe(200);
      const read = parseApiSchema(
        ContentQueryResultSchema,
        (
          await request("queryLocalContent", {
            kind: "read",
            scope,
            resource: "进程",
          })
        ).body,
      );
      if (read.kind !== "read") throw new Error("Expected a resource read.");
      const selectedBlock = read.document.blocks[0]!;
      const selected = await request("queryLocalContent", {
        kind: "read",
        scope,
        resource: "进程",
        blockId: selectedBlock.blockId,
      });
      expect(JSON.stringify(selected.body)).not.toContain("无关内容");
      const edit = {
        operationId: randomUUID(),
        baseRevision: read.baseRevision,
        scope,
        command: {
          kind: "edit-content",
          resource: "进程",
          edit: {
            kind: "replace-text",
            blockId: selectedBlock.blockId,
            replacements: [{ oldText: "修改目标", newText: "已修改" }],
          },
        },
      };
      const edited = await request("executeContentOperation", edit);
      expect(edited.status).toBe(200);
      expect(edited.sent).not.toContain("无关内容");
      expect(edited.received).not.toContain("无关内容 199");
      expect(Buffer.byteLength(edited.received)).toBeLessThan(
        Buffer.byteLength(source),
      );
      const staleId = randomUUID();
      const stale = await request("executeContentOperation", {
        ...edit,
        operationId: staleId,
      });
      expect(stale.status).toBe(409);
      expect(parseApiError(stale.body)).toMatchObject({
        code: "resource_conflict",
        details: { operationId: staleId },
      });
      expect(
        parseApiSchema(
          ContentOperationResultSchema,
          (await request("getContentOperation", undefined, staleId)).body,
        ),
      ).toMatchObject({ status: "conflict" });
      expect(
        (
          await request("executeContentOperation", {
            ...edit,
            command: { kind: "delete-note", resource: "进程" },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request("queryLocalContent", { kind: "catalog" }, undefined, {
            authorization: "Bearer old-retired-secret",
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await request("queryLocalContent", { kind: "catalog" }, undefined, {
            origin: "https://untrusted.example",
          })
        ).status,
      ).toBe(403);

      const initialJournal = await service.query({
        kind: "directory",
        scope: { domain: "journal" },
      });
      const interrupted = {
        operationId: randomUUID(),
        baseRevision: initialJournal.baseRevision,
        scope: { domain: "journal" as const },
        command: { kind: "create-entry" as const, body: "- 提交后断开连接" },
      };
      holdAfterCommit = true;
      const controller = new AbortController();
      const responseLost = expect(
        request(
          "executeContentOperation",
          interrupted,
          undefined,
          {},
          controller.signal,
        ),
      ).rejects.toThrow();
      await committed;
      controller.abort();
      releaseCommit();
      await responseLost;
      await expect
        .poll(
          async () => (await service.result(interrupted.operationId))?.status,
        )
        .toBe("committed");
      const result = await request(
        "getContentOperation",
        undefined,
        interrupted.operationId,
      );
      expect(
        (await request("executeContentOperation", interrupted)).body,
      ).toEqual(result.body);
      const finalJournal = await service.query({
        kind: "directory",
        scope: { domain: "journal" },
      });
      if (finalJournal.kind !== "directory")
        throw new Error("Expected Journal directory");
      expect(finalJournal.resources).toHaveLength(1);
    } finally {
      releaseCommit();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await fixture.dispose();
    }
  });
});
