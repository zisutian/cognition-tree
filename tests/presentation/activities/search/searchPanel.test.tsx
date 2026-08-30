// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  SearchControllerView,
  SearchControllerState,
} from "../../../../application/search/searchController";
import { SearchPanel } from "../../../../presentation/activities/search/SearchPanel";

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
  results: [{
    blockId: "block-1",
    domain: "workspace",
    repositoryId: "repository-1",
    resourceId: "note-1",
    snippet: "概念正文",
    title: "示例笔记",
    updatedAt: "2026-08-26T00:00:00.000Z",
    version: "sha256:search-test",
  }],
  status: "ready",
  submitted: {
    domains: ["workspace"],
    query: "概念",
  },
};

describe("SearchPanel", () => {
  it("renders grouped results through the shared results surface and rows", () => {
    const markup = renderToStaticMarkup(
      <SearchPanel
        controller={controller}
        onOpenResult={() => undefined}
        repositories={[{ id: "repository-1", label: "知识库" }]}
        state={state}
      />,
    );

    expect(markup).toContain("ui-tool-panel");
    expect(markup).toContain('data-tool-layout="results"');
    expect(markup).toContain('aria-label="搜索结果列表"');
    expect(markup).toContain('aria-label="示例笔记的匹配项"');
    expect(markup).toContain("ui-tool-list-row-wrap");
    expect(markup).toContain("块匹配");
    expect(markup).toContain("概念正文");
    expect(markup).toContain("加载更多");
  });
});
