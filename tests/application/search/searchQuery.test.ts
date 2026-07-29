import { describe, expect, it, vi } from "vitest";
import {
  createSearchController,
  searchDraftsEqual,
} from "../../../application/search/searchController";
import {
  createSearchQuery,
  projectSearchDocumentResults,
  SearchRequestError,
  type SearchDocument,
  type SearchDomain,
  type SearchResult,
  type SearchSource,
} from "../../../application/search/searchQuery";

const version = (character: string) =>
  `sha256:${character.repeat(64)}` as const;

function document({
  blockId,
  domain,
  repositoryId,
  resourceId,
  text,
  updatedAt,
  resourceUpdatedAt = updatedAt,
}: {
  blockId: string;
  domain: SearchDomain;
  repositoryId?: string;
  resourceId: string;
  resourceUpdatedAt?: string;
  text: string;
  updatedAt: string;
}): SearchDocument {
  const common = {
    blocks: [{ blockId, body: null, text, updatedAt }],
    editableText: text,
    resourceId,
    title: `${domain}-${resourceId}`,
    updatedAt: resourceUpdatedAt,
    version: version(domain === "workspace" ? "a" : "b"),
  };

  if (domain === "workspace") {
    if (!repositoryId) throw new Error("workspace test document needs repositoryId");
    return { ...common, domain, repositoryId };
  }
  return { ...common, domain };
}

function resultFromDocument(value: SearchDocument): SearchResult {
  const common = {
    blockId: value.blocks[0]!.blockId,
    resourceId: value.resourceId,
    snippet: value.editableText,
    title: value.title,
    updatedAt: value.updatedAt,
    version: value.version,
  };

  return value.domain === "workspace"
    ? {
        ...common,
        domain: value.domain,
        repositoryId: value.repositoryId,
      }
    : { ...common, domain: value.domain };
}

function corpusKey(value: unknown) {
  const source = JSON.stringify(value);
  let hash = 2_166_136_261;

  for (const character of source) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16_777_619);
  }
  return `test_${(hash >>> 0).toString(16)}`;
}

describe("cross-domain search query", () => {
  it("normalizes, filters and pages successful sources while retaining faults", async () => {
    const unicodeDocument = document({
      blockId: "unicode-block",
      domain: "todo",
      resourceId: "todo-unicode",
      text: "前缀 aﬃnity 👩🏽‍💻 后缀",
      updatedAt: "2026-07-29T10:00:00.000Z",
    });
    expect(projectSearchDocumentResults(unicodeDocument, {
      query: "AFFINITY",
    })).toEqual([
      expect.objectContaining({
        blockId: "unicode-block",
        snippet: "前缀 aﬃnity 👩🏽‍💻 后缀",
      }),
    ]);
    const filteredBlockDocument: SearchDocument = {
      ...document({
        blockId: "old-block",
        domain: "todo",
        resourceId: "todo-filter-order",
        resourceUpdatedAt: "2026-07-29T11:00:00.000Z",
        text: "needle in old block",
        updatedAt: "2026-07-29T07:00:00.000Z",
      }),
      editableText: "needle in current resource",
      title: "current resource",
    };
    expect(projectSearchDocumentResults(filteredBlockDocument, {
      query: "needle",
      updatedAfter: "2026-07-29T08:00:00.000Z",
    })).toEqual([
      expect.objectContaining({
        blockId: null,
        resourceId: "todo-filter-order",
      }),
    ]);

    let workspaceRevision = "workspace-1";
    let documentProjectionCount = 0;
    const sources: SearchSource[] = [
      {
        domain: "workspace",
        async load() {
          return {
            async loadDocuments() {
              documentProjectionCount += 1;
              return [
                document({
                  blockId: "block-workspace",
                  domain: "workspace",
                  repositoryId: "repository-a",
                  resourceId: "note-a",
                  resourceUpdatedAt: "2026-07-29T07:00:00.000Z",
                  text: "ＣＴＮ Needle",
                  updatedAt: "2026-07-29T10:00:00.000Z",
                }),
                {
                  blocks: [],
                  domain: "workspace",
                  editableText: "未知源码中的 CTN needle",
                  repositoryId: "repository-a",
                  resourceId: "note-unknown",
                  title: "未知源码",
                  updatedAt: "2026-07-29T08:30:00.000Z",
                  version: version("c"),
                },
              ];
            },
            revision: workspaceRevision,
          };
        },
        repositoryId: "repository-a",
      },
      {
        createFault: () => ({
          code: "source_invalid",
          domain: "journal",
          message: "日记数据无效",
        }),
        domain: "journal",
        async load() {
          throw new Error("sensitive local path");
        },
      },
      {
        domain: "todo",
        async load() {
          return {
            async loadDocuments() {
              documentProjectionCount += 1;
              return [
                document({
                  blockId: "block-todo",
                  domain: "todo",
                  resourceId: "todo-a",
                  text: "ctn needle",
                  updatedAt: "2026-07-29T09:00:00.000Z",
                }),
              ];
            },
            revision: "todo-1",
          };
        },
      },
    ];
    const query = createSearchQuery({
      createCorpusKey: corpusKey,
      sourceProvider: {
        async listSources(request) {
          const domains = new Set(request.domains);

          return {
            faults: [],
            sources: sources.filter(({ domain, repositoryId }) =>
              domains.has(domain) &&
              (
                domain !== "workspace" ||
                !request.repositoryIds ||
                request.repositoryIds.includes(repositoryId!)
              )
            ),
          };
        },
      },
    });
    const first = await query.search({
      domains: ["workspace", "journal", "todo"],
      limit: 1,
      query: "ctn needle",
      repositoryIds: ["repository-a"],
      updatedAfter: "2026-07-29T08:00:00.000Z",
    }, undefined);

    expect(first.cursor).toEqual(expect.any(String));
    expect(first.faults).toEqual([{
      code: "source_invalid",
      domain: "journal",
      message: "日记数据无效",
    }]);
    expect(first.results).toHaveLength(1);
    expect(first.results[0]).toMatchObject({
      domain: "workspace",
      repositoryId: "repository-a",
      resourceId: "note-a",
    });
    const second = await query.search({
      cursor: first.cursor!,
      domains: ["workspace", "journal", "todo"],
      limit: 1,
      query: "ctn needle",
      repositoryIds: ["repository-a"],
      updatedAfter: "2026-07-29T08:00:00.000Z",
    }, undefined);

    expect(second.results.length).toBeGreaterThan(0);
    expect(second.results.every(({ domain }) => domain === "todo")).toBe(true);
    const third = await query.search({
      cursor: second.cursor!,
      domains: ["workspace", "journal", "todo"],
      limit: 1,
      query: "ctn needle",
      repositoryIds: ["repository-a"],
      updatedAfter: "2026-07-29T08:00:00.000Z",
    }, undefined);

    expect(third.results).toEqual([
      expect.objectContaining({
        blockId: null,
        resourceId: "note-unknown",
      }),
    ]);
    expect(documentProjectionCount).toBe(2);
    workspaceRevision = "workspace-2";
    await expect(query.search({
      cursor: first.cursor!,
      domains: ["workspace", "journal", "todo"],
      limit: 1,
      query: "ctn needle",
      repositoryIds: ["repository-a"],
      updatedAfter: "2026-07-29T08:00:00.000Z",
    }, undefined)).rejects.toMatchObject({
      code: "cursor_conflict",
    } satisfies Partial<SearchRequestError>);
  });

  it("keeps submitted paging stable while draft filters change explicitly", async () => {
    const requests: string[] = [];
    const query = {
      search: vi.fn(async (request: { cursor?: string; query: string }) => {
        requests.push(request.query);
        return request.cursor
          ? {
              cursor: null,
              faults: [],
              results: [
                document({
                  blockId: "block-2",
                  domain: "todo",
                  resourceId: "todo-2",
                  text: "第二页",
                  updatedAt: "2026-07-29T09:00:00.000Z",
                }),
              ].map(resultFromDocument),
            }
          : {
              cursor: "v1-page",
              faults: [],
              results: [
                document({
                  blockId: "block-1",
                  domain: "workspace",
                  repositoryId: "repository-a",
                  resourceId: "note-1",
                  text: "第一页",
                  updatedAt: "2026-07-29T10:00:00.000Z",
                }),
              ].map(resultFromDocument),
            };
      }),
    };
    const controller = createSearchController({
      onChange: () => undefined,
      query,
    });

    controller.updateDraft({ query: "原条件" });
    expect(query.search).not.toHaveBeenCalled();
    await controller.search();
    controller.updateDraft({ query: "新条件" });
    expect(
      searchDraftsEqual(
        controller.getState().draft,
        controller.getState().submitted,
      ),
    ).toBe(false);
    await controller.loadMore();

    expect(requests).toEqual(["原条件", "原条件"]);
    expect(controller.getState()).toMatchObject({
      cursor: null,
      results: [{ resourceId: "note-1" }, { resourceId: "todo-2" }],
      status: "ready",
    });
    controller.dispose();

    const invalidated = createSearchController({
      onChange: () => undefined,
      query: {
        async search(request) {
          if (request.cursor) {
            throw new SearchRequestError(
              "cursor_conflict",
              "Search results changed while paging",
            );
          }
          return {
            cursor: "v1-page",
            faults: [],
            results: [],
          };
        },
      },
    });

    invalidated.updateDraft({ query: "会变化的条件" });
    await invalidated.search();
    await invalidated.loadMore();
    expect(invalidated.getState()).toMatchObject({
      cursor: null,
      errorMessage: "搜索来源已更新，请重新搜索。",
      status: "ready",
    });
    invalidated.dispose();
  });
});
