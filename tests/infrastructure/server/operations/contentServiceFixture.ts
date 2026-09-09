import {
  createWorkspaceRepositoryRevision,
  createJournalRevision,
  createTodoRevision,
} from "../../../../infrastructure/server/repository/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ContentService,
  type ContentCommand,
  type ContentScope,
  type ContentServicePorts,
} from "../../../../application/content/index.ts";
import type { ContentOperationScope } from "../../../../application/operations/index.ts";
import {
  BuiltInCatalog,
  LocalRepositoryCatalog,
} from "../../../../infrastructure/server/repository/index.ts";
import { OperationLedger } from "../../../../infrastructure/server/operations/index.ts";
import {
  createApiResourceVersion,
  journalResourceVersions,
  todoResourceVersions,
  workspaceResourceVersions,
} from "../../../../infrastructure/server/api/resources/index.ts";

export async function createContentServiceFixture(existingRoot?: string) {
  const root =
    existingRoot ??
    (await mkdtemp(path.join(os.tmpdir(), "ctn-content-service-")));
  const catalog = new LocalRepositoryCatalog(path.join(root, "repositories"));
  const builtIns = new BuiltInCatalog(catalog.rootPath);
  const ledger = new OperationLedger(path.join(root, "server-state"), 20);
  let tick = 0;
  const runtime: ContentServicePorts["runtime"] = {
    createId: randomUUID,
    now: () => new Date(Date.UTC(2026, 8, 9, 0, 0, tick++)),
    timezoneOffsetMinutes: () => 0,
    today: () => "2026-09-09",
  };
  const ports: ContentServicePorts = {
    catalog: { run: (operation) => catalog.runContentCatalog(operation) },
    journal: () => builtIns.getStore("journal"),
    todo: () => builtIns.getStore("todo"),
    ledger,
    digest: createApiResourceVersion,
    runtime,
    revisions: {
      workspace: createWorkspaceRepositoryRevision,
      journal: createJournalRevision,
      todo: createTodoRevision,
    },
    versions: {
      workspace: workspaceResourceVersions,
      journal: journalResourceVersions,
      todo: todoResourceVersions,
    },
    onCommitted: () => {},
    onCatalogChanged: () => {},
  };
  try {
    await catalog.initialize();
    await builtIns.initialize();
    await ledger.initialize();
  } catch (error) {
    await catalog.dispose();
    await rm(root, { force: true, recursive: true });
    throw error;
  }
  const service = new ContentService(ports);
  return {
    root,
    catalog,
    builtIns,
    ports,
    service,
    ledger,
    async apply(
      scope: ContentOperationScope,
      command: ContentCommand,
      operationId = randomUUID(),
    ) {
      const { basis } = await service.query(
        scope.domain === "catalog"
          ? { kind: "catalog" }
          : { kind: "directory", scope },
      );
      return service.execute({ scope, command, basis, operationId });
    },
    async read(
      scope: ContentScope,
      resource: string,
      blockId?: string,
      subtree?: boolean,
    ) {
      const result = await service.query({
        kind: "read",
        scope,
        resource,
        ...(blockId ? { blockId } : {}),
        ...(subtree === undefined ? {} : { subtree }),
      });
      if (result.kind !== "read")
        throw new Error("Unexpected content query result.");
      return result;
    },
    async dispose() {
      await catalog.dispose();
      await rm(root, { force: true, recursive: true });
    },
  };
}
