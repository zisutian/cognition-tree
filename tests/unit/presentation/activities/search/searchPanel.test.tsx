import { createSearchActivitySlots } from "../../../../../presentation/activities/search/SearchActivitySlots";
// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  SearchControllerView,
  SearchControllerState,
} from "../../../../../application/search/searchController";
import { SearchPanel } from "../../../../../presentation/activities/search/SearchPanel";

const controller: SearchControllerView = {
  getScrollTop: () => 24,
  loadMore: async () => undefined,
  search: async () => undefined,
  updateDraft: () => undefined,
  updateScrollTop: () => undefined,
};

const state: SearchControllerState = {
  cursor: "next",
  draft: {
    domains: ["workspace"],
    query: "概念",
  },
  errorMessage: null,
  faults: [],
  loadingMore: false,
  results: [
    {
      blockId: "block-1",
      domain: "workspace",
      repositoryId: "repository-1",
      resourceId: "note-1",
      snippet: "概念正文",
      title: "示例笔记",
      updatedAt: "2026-08-26T00:00:00.000Z",
      version: "sha256:search-test",
    },
  ],
  status: "ready",
  submitted: {
    domains: ["workspace"],
    query: "概念",
  },
};

describe("SearchPanel", () => {
  it("labels grouped block results and pagination", () => {
    const markup = renderToStaticMarkup(
      <SearchPanel
        controller={controller}
        onOpenResult={() => undefined}
        repositories={[{ id: "repository-1", label: "知识库" }]}
        state={state}
      />,
    );

    expect(markup).toContain('aria-label="搜索结果列表"');
    expect(markup).toContain('aria-label="示例笔记的匹配项"');
    expect(markup).toContain("块匹配");
    expect(markup).toContain("概念正文");
    expect(markup).toContain("加载更多");
  });
  it("presents selected block results, source faults and changes to the submitted query", () => {
    const submitted = {
      domains: ["workspace", "journal", "todo"] as const,
      query: "共同词",
    };
    const resultBase = {
      domain: "workspace" as const,
      repositoryId: "repository-a",
      resourceId: "note-a",
      title: "Alpha",
      updatedAt: "2026-07-29T10:00:00.000Z",
      version: `sha256:${"a".repeat(64)}` as `sha256:${string}`,
    };
    const searchSlots = createSearchActivitySlots({
      controller,
      onCollapseDetail: () => undefined,
      onOpenResult: () => undefined,
      repositories: [{ id: "repository-a", label: "仓库 A" }],
      state: {
        ...state,
        draft: {
          ...submitted,
          domains: [...submitted.domains],
        },
        faults: [
          {
            code: "source_unavailable",
            domain: "journal",
            message: "暂时不可用",
          },
        ],
        results: [
          {
            ...resultBase,
            blockId: null,
            snippet: "整篇共同词",
          },
          {
            ...resultBase,
            blockId: "block-a",
            snippet: "块内共同词",
          },
        ],
        status: "ready",
        submitted: {
          ...submitted,
          domains: [...submitted.domains],
        },
      },
    });
    const searchContext = renderToStaticMarkup(searchSlots.context?.content);
    const searchMain = renderToStaticMarkup(searchSlots.main);

    expect(searchContext).toContain('role="search"');
    expect(searchContext).toContain('aria-label="搜索"');
    expect(searchContext).toContain("本地仓库");
    expect(searchContext).toContain("日记");
    expect(searchContext).toContain("代办");
    expect(searchContext).not.toContain('type="datetime-local"');
    expect(searchContext).not.toContain("更多条件");
    expect(searchContext).not.toContain("仓库 A");
    expect(searchMain).toContain("部分来源不可用");
    expect(searchMain).toContain(`搜索 · ${submitted.query}`);
    expect(searchMain).toContain("块内共同词");
    expect(searchMain).toContain('aria-label="打开Alpha中的匹配块"');
    expect(searchMain).not.toContain("整篇共同词");
    expect(renderToStaticMarkup(searchSlots.detail)).toContain(
      'aria-label="搜索状态"',
    );

    const renderSearchState = (override: Partial<SearchControllerState>) =>
      renderToStaticMarkup(
        createSearchActivitySlots({
          controller,
          onCollapseDetail: () => undefined,
          onOpenResult: () => undefined,
          repositories: [{ id: "repository-a", label: "仓库 A" }],
          state: {
            ...state,
            status: "ready",
            submitted: {
              ...submitted,
              domains: [...submitted.domains],
            },
            ...override,
          },
        }).main,
      );
    expect(
      renderSearchState({
        draft: {
          ...submitted,
          domains: [...submitted.domains],
          query: "另一个搜索词",
        },
      }),
    ).toContain("条件已修改");
    const statusScenarios: Array<
      [Parameters<typeof renderSearchState>[0], string]
    > = [
      [{ status: "loading" }, "正在搜索"],
      [{ results: [] }, "没有结果"],
      [
        {
          errorMessage: "无法执行搜索",
          results: [],
        },
        "搜索失败",
      ],
      [
        {
          faults: [
            {
              code: "source_unavailable",
              domain: "todo",
              message: "暂时不可用",
            },
          ],
          results: [],
        },
        "搜索来源不可用",
      ],
      [
        {
          errorMessage: "搜索来源已更新，请重新搜索。",
          results: [
            {
              ...resultBase,
              blockId: "block-a",
              snippet: "保留旧结果",
            },
          ],
        },
        "搜索来源已更新，请重新搜索。",
      ],
    ];

    for (const [state, expectedText] of statusScenarios) {
      expect(renderSearchState(state)).toContain(expectedText);
    }
  });
});
