// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
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
    const server = createApiServer({
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
    ) {
      const definition = getApiOperation(operationId);
      const response = await fetch(
        `${origin}${buildApiOperationPath(operationId, operation ? { operationId: operation } : {})}`,
        {
          method: definition.method,
          headers: { "content-type": "application/json", ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      const parsed: unknown = await response.json();
      if (response.status >= 400) parseApiError(parsed);
      else parseApiOperationResponse(operationId, response.status, parsed);
      return { status: response.status, body: parsed };
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
      const createNote = await request("executeContentOperation", {
        operationId: randomUUID(),
        baseRevision: directory.baseRevision,
        scope,
        command: {
          kind: "create-note",
          parent: null,
          title: "进程",
          body: "- 修改目标\n- 无关内容",
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
      expect((await request("executeContentOperation", edit)).status).toBe(200);
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
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await fixture.dispose();
    }
  });
});
