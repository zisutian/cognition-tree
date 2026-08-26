// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type {
  DomainChangeSetDto,
  ApiPrincipalDto,
} from "../../../../contracts/api/types.ts";
import type {
  RepositoryDescriptorDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  createApiRequestHandler,
} from "../../../../infrastructure/server/api/http/server.ts";
import {
  createApiSecurityPolicy,
} from "../../../../infrastructure/server/api/http/security.ts";
import type { ApiBuiltInCatalog } from "../../../../infrastructure/server/api/http/ports.ts";
import { ApiSearchService } from "../../../../infrastructure/server/api/search.ts";
import { workspaceResourceVersions } from "../../../../infrastructure/server/api/resources/versions.ts";
import { ApiRevisionTracker } from "../../../../infrastructure/server/api/sync/revisionTracker.ts";
import { synchronizeApiWorkspace } from "../../../../infrastructure/server/api/sync/service.ts";
import type {
  WorkspaceRepositoryCatalog,
} from "../../../../infrastructure/server/repository/catalog.ts";
import {
  RepositoryCorruptError,
} from "../../../../infrastructure/server/repository/store.ts";
import {
  createContent,
  createRuntime,
  dispatchRaw,
  preparedWorkspaceSnapshot,
  revision,
} from "./support/apiServerTestHarness.ts";
import { createWorkspaceRepositoryRevision } from "../../../../infrastructure/server/repository/workspace/revision.ts";

describe("CTN API v3", () => {
  it("keeps SSE checkpoints lightweight and derives sync changes from the CAS payload", async () => {
    const trackedRevision = revision("a");
    const tracker = new ApiRevisionTracker();
    let catalogReads = 0;
    let storeReads = 0;
    const unavailableCatalog = {
      async createRepository() {
        throw new Error("not used");
      },
      async deleteRepository() {
        throw new Error("not used");
      },
      async getStore() {
        storeReads += 1;
        throw new Error("checkpoint must not load a store");
      },
      async listRepositories() {
        catalogReads += 1;
        throw new Error("checkpoint must not scan the catalog");
      },
      async renameRepository() {
        throw new Error("not used");
      },
    } satisfies WorkspaceRepositoryCatalog;
    const unavailableBuiltIns = {
      async getStore() {
        storeReads += 1;
        throw new Error("checkpoint must not load built-in content");
      },
      async listBuiltIns() {
        throw new Error("not used");
      },
      async retry() {
        throw new Error("not used");
      },
    } as ApiBuiltInCatalog;

    tracker.observeWorkspace("workspace-a", trackedRevision);
    tracker.observeDomain("journal", revision("b"));
    const handler = createApiRequestHandler({
      builtInCatalog: unavailableBuiltIns,
      catalog: unavailableCatalog,
      revisionTracker: tracker,
      runtime: createRuntime(),
      security: createApiSecurityPolicy({
        ownerSessions: {
          authenticateOwnerSecret: async () => false,
          createOwnerSession: async () => "unused",
          verifyOwnerSession: async () => false,
        },
        port: 3_001,
        publicOrigin: null,
      }),
    });
    const events = await dispatchRaw(handler, {
      method: "GET",
      url: "/api/v3/content/events",
    });

    expect(catalogReads).toBe(0);
    expect(storeReads).toBe(0);
    expect(events.body).toContain(`"workspace-a":"${trackedRevision}"`);
    expect(events.body).toContain(`"journal":"${revision("b")}"`);

    const before = createContent();
    const after: WorkspaceRepositoryContentDto = {
      ...before,
      workspace: {
        ...before.workspace,
        notes: before.workspace.notes.map((note, index) =>
          index === 0
            ? {
                ...note,
                source: note.source.replace("未命名笔记", "同步标题"),
              }
            : note
        ),
      },
    };
    const syncBaseRevision = createWorkspaceRepositoryRevision(before);
    let snapshotLoads = 0;
    const published: DomainChangeSetDto[] = [];
    const syncResult = await synchronizeApiWorkspace({
      mode: "commit",
      observeRevision: () => {},
      publish(changes) {
        published.push(changes);
        return Promise.resolve();
      },
      readJsonBody: () =>
        Promise.resolve({
          base: { content: before, revision: syncBaseRevision },
          content: after,
        }),
      repositoryId: "workspace-a",
      runtime: createRuntime(),
      store: {
        async commit(transaction) {
          const beforeSnapshot = preparedWorkspaceSnapshot(
            before,
            syncBaseRevision,
          );
          const afterSnapshot = {
            content: transaction.content,
            projection: transaction.projection,
            revision: revision("c"),
          };

          return {
            after: afterSnapshot,
            before: beforeSnapshot,
            revision: revision("c"),
          };
        },
        async loadSnapshot() {
          snapshotLoads += 1;
          return preparedWorkspaceSnapshot(before, syncBaseRevision);
        },
      },
      versionPolicy: workspaceResourceVersions,
    });

    expect(syncResult).toMatchObject({
      body: {
        outcome: "committed",
        snapshot: { revision: revision("c") },
      },
      statusCode: 200,
    });
    expect(snapshotLoads).toBe(1);
    expect(published).toHaveLength(1);
    expect(published[0]!.resources).toContainEqual(expect.objectContaining({
      domain: "workspace",
      resourceId: before.workspace.notes[0]!.id,
    }));
  });

  it("returns sanitized source faults without discarding readable search results", async () => {
    const goodContent = createContent();
    const descriptors: RepositoryDescriptorDto[] = [
      {
        id: "good",
        label: "可读仓库",
        labelIssue: null,
        location: {
          hostPath: null,
          serverPath: "/repositories/good",
        },
      },
      {
        id: "broken",
        label: "损坏仓库",
        labelIssue: null,
        location: {
          hostPath: null,
          serverPath: "/repositories/broken",
        },
      },
    ];
    const catalog: WorkspaceRepositoryCatalog = {
      async createRepository() {
        throw new Error("not used");
      },
      async deleteRepository() {
        return undefined;
      },
      async getStore(repositoryId: string) {
        return {
          async commit() {
            throw new Error("not used");
          },
          async loadSnapshot() {
            if (repositoryId === "broken") {
              throw new RepositoryCorruptError(
                "/private/repository/content.json is invalid",
              );
            }
            return preparedWorkspaceSnapshot(goodContent, revision("a"));
          },
        };
      },
      async listRepositories() {
        return {
          issues: [],
          repositories: descriptors,
        };
      },
      async renameRepository() {
        throw new Error("not used");
      },
    };
    const principal: ApiPrincipalDto = {
      id: "owner",
      kind: "owner",
      name: "Owner",
    };
    const search = new ApiSearchService({
      builtInCatalog: {} as ApiBuiltInCatalog,
      catalog,
    });
    const response = await search.search({
      domains: ["workspace"],
      query: "未命名笔记",
    }, principal);

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.every((result) =>
      result.domain === "workspace" &&
      result.repositoryId === "good"
    )).toBe(true);
    expect(response.faults).toEqual([{
      code: "source_invalid",
      domain: "workspace",
      message: "Search source contains invalid data",
      repositoryId: "broken",
    }]);
    expect(JSON.stringify(response)).not.toContain("/private/");
  });
});
