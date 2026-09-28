import { describe, expect, it, vi } from "vitest";
import {
  createSearchController,
  searchDraftsEqual,
} from "../../../../application/search/searchController";
import {
  createSearchQuery,
  SearchIndex,
} from "../../../../application/search/searchIndex";
import {
  projectSearchDocumentResults,
} from "../../../../application/search/searchText";
import {
  SearchRequestError,
  type SearchDocument,
  type SearchDomain,
  type SearchResult,
  type SearchSource,
} from "../../../../application/search/searchTypes";

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
  it("shares one load limit across overlapping queries and releases failed loads", async () => {
    let active = 0;
    let peak = 0;
    let sourceLoads = 0;
    let documentLoads = 0;
    const duringLoad = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    };
    const sources: SearchSource[] = Array.from({ length: 80 }, (_, index) => ({
      domain: "workspace",
      repositoryId: `repository-${index}`,
      async load() {
        sourceLoads += 1;
        await duringLoad();
        if (index === 7) throw new Error("temporary failure");
        return {
          revision: `revision-${index}`,
          async loadDocuments() {
            documentLoads += 1;
            await duringLoad();
            return [document({
              blockId: `block-${index}`,
              domain: "workspace",
              repositoryId: `repository-${index}`,
              resourceId: `note-${index}`,
              text: "shared needle",
              updatedAt: "2026-07-29T10:00:00.000Z",
            })];
          },
        };
      },
    }));
    const query = new SearchIndex({
      createCorpusKey: corpusKey,
      sourceProvider: { async listSources() { return { faults: [], sources }; } },
    });
    const [first, second] = await Promise.all([
      query.search({ query: "needle", limit: 100 }, undefined),
      query.search({ query: "shared", limit: 100 }, undefined),
    ]);

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(sourceLoads).toBe(160);
    expect(documentLoads).toBeGreaterThanOrEqual(79);
    expect(first.results).toHaveLength(79);
    expect(second.results).toHaveLength(79);
    expect(first.faults).toHaveLength(1);
    expect(second.faults).toHaveLength(1);
    expect(() => new SearchIndex({
      createCorpusKey: corpusKey,
      maximumConcurrentLoads: 0,
      sourceProvider: { async listSources() { return { faults: [], sources }; } },
    })).toThrow(RangeError);
  });

  it("shares permits across snapshot and document phases and keeps paging stable across completion orders", async () => {
    const run = async (reverse: boolean) => {
      let active = 0;
      let peak = 0;
      let alphaDocumentActive = false;
      let startAlphaDocument: () => void = () => undefined;
      const alphaDocumentStarted = new Promise<void>((resolve) => {
        startAlphaDocument = resolve;
      });
      let releaseAlphaDocument: () => void = () => undefined;
      const alphaDocumentGate = new Promise<void>((resolve) => {
        releaseAlphaDocument = resolve;
      });
      let observeMixedPhases: () => void = () => undefined;
      const mixedPhases = new Promise<void>((resolve) => {
        observeMixedPhases = resolve;
      });
      const load = async (delay: number, kind: "source" | "documents") => {
        active += 1;
        peak = Math.max(peak, active);
        if (kind === "source" && alphaDocumentActive) observeMixedPhases();
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
      };
      const betaSources: SearchSource[] = Array.from({ length: 3 }, (_, index) => ({
        domain: "workspace",
        repositoryId: `repository-${index}`,
        async load() {
          await load(reverse ? 2 + index * 3 : 8 - index * 3, "source");
          return {
            revision: `revision-${index}`,
            async loadDocuments() {
              await load(reverse ? 8 - index * 3 : 2 + index * 3, "documents");
              return [document({
                blockId: `block-${index}`,
                domain: "workspace",
                repositoryId: `repository-${index}`,
                resourceId: `note-${index}`,
                text: "beta",
                updatedAt: `2026-07-29T0${index + 7}:00:00.000Z`,
              })];
            },
          };
        },
      }));
      const alphaSource: SearchSource = {
        domain: "todo",
        async load() {
          return {
            revision: "alpha-revision",
            async loadDocuments() {
              active += 1;
              peak = Math.max(peak, active);
              alphaDocumentActive = true;
              startAlphaDocument();
              await alphaDocumentGate;
              alphaDocumentActive = false;
              active -= 1;
              return [document({
                blockId: "alpha-block",
                domain: "todo",
                resourceId: "alpha-note",
                text: "alpha",
                updatedAt: "2026-07-29T10:00:00.000Z",
              })];
            },
          };
        },
      };
      const query = new SearchIndex({
        createCorpusKey: corpusKey,
        maximumConcurrentLoads: 2,
        sourceProvider: {
          async listSources(request) {
            return {
              faults: [],
              sources: request.query === "alpha" ? [alphaSource] : betaSources,
            };
          },
        },
      });
      const alpha = query.search({ query: "alpha" }, undefined);
      await alphaDocumentStarted;
      const beta = query.search({ query: "beta", limit: 1 }, undefined);
      let overlapTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          mixedPhases,
          new Promise<never>((_, reject) => {
            overlapTimeout = setTimeout(
              () => reject(new Error("load phases did not overlap")), 1_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(overlapTimeout);
        releaseAlphaDocument();
      }
      const [first] = await Promise.all([beta, alpha]);
      const second = await query.search({ query: "beta", limit: 1, cursor: first.cursor! }, undefined);
      const third = await query.search({ query: "beta", limit: 1, cursor: second.cursor! }, undefined);
      return {
        cursor: first.cursor,
        peak,
        resourceIds: [...first.results, ...second.results, ...third.results]
          .map(({ resourceId }) => resourceId),
        finalCursor: third.cursor,
      };
    };

    const first = await run(false);
    const reversed = await run(true);
    expect(first.peak).toBe(2);
    expect(reversed.peak).toBe(2);
    expect(first.resourceIds).toEqual(["note-2", "note-1", "note-0"]);
    expect(reversed.resourceIds).toEqual(first.resourceIds);
    expect(reversed.cursor).toBe(first.cursor);
    expect(first.finalCursor).toBeNull();
    expect(reversed.finalCursor).toBeNull();
  });

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
    }, undefined);

    expect(second.results.length).toBeGreaterThan(0);
    expect(second.results.every(({ domain }) => domain === "todo")).toBe(true);
    const third = await query.search({
      cursor: second.cursor!,
      domains: ["workspace", "journal", "todo"],
      limit: 1,
      query: "ctn needle",
      repositoryIds: ["repository-a"],
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
    const stateBeforeScroll = controller.getState();

    controller.updateScrollTop(48);
    expect(controller.getScrollTop()).toBe(48);
    expect(controller.getState()).toBe(stateBeforeScroll);
    expect(query.search).not.toHaveBeenCalled();
    await controller.search();
    expect(controller.getScrollTop()).toBe(0);
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
