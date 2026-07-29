import { useLayoutEffect, useRef } from "react";
import type {
  SearchController,
  SearchControllerState,
} from "../../../../application/search/searchController";
import type {
  SearchDomain,
  SearchResult,
} from "../../../../application/search/searchQuery";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../../ui/shared/primitives";
import type { SearchRepositoryOption } from "./searchViewTypes";

const domainLabels: Record<SearchDomain, string> = {
  journal: "日记",
  todo: "代办",
  workspace: "Workspace",
};

export type SearchResultGroup = {
  domain: SearchDomain;
  hits: SearchResult[];
  key: string;
  repositoryId?: string;
  resourceId: string;
  title: string;
  updatedAt: string;
};

export function groupSearchResults(
  results: readonly SearchResult[],
): SearchResultGroup[] {
  const groups = new Map<string, SearchResultGroup>();

  for (const result of results) {
    const key =
      `${result.domain}:${result.repositoryId ?? ""}:${result.resourceId}`;
    const group = groups.get(key);

    if (group) {
      if (
        !group.hits.some(({ blockId }) => blockId === result.blockId)
      ) {
        group.hits.push(result);
      }
      if (result.updatedAt > group.updatedAt) {
        group.updatedAt = result.updatedAt;
      }
      continue;
    }
    groups.set(key, {
      domain: result.domain,
      hits: [result],
      key,
      ...(result.repositoryId
        ? { repositoryId: result.repositoryId }
        : {}),
      resourceId: result.resourceId,
      title: result.title,
      updatedAt: result.updatedAt,
    });
  }
  return [...groups.values()].map((group) => {
    const blockHits = group.hits.filter(({ blockId }) => blockId !== null);

    return {
      ...group,
      hits: blockHits.length > 0 ? blockHits : group.hits.slice(0, 1),
    };
  });
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export function SearchPanel({
  controller,
  onOpenResult,
  repositories,
  state,
}: {
  controller: SearchController;
  onOpenResult(result: SearchResult): void;
  repositories: SearchRepositoryOption[];
  state: SearchControllerState;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const groups = groupSearchResults(state.results);
  const repositoryLabelById = new Map(
    repositories.map(({ id, label }) => [id, label]),
  );
  const allSourcesFailed = state.faults.length > 0 &&
    groups.length === 0 &&
    !state.errorMessage;

  useLayoutEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = controller.getState().scrollTop;
    }
  }, [controller, state.scrollTop, state.submitted]);

  return (
    <Panel aria-label="搜索结果" className="search-panel">
      <PanelHeader title="搜索结果" />
      <PanelBody
        className="search-panel-body"
        onScroll={(event) =>
          controller.updateScrollTop(event.currentTarget.scrollTop)}
        ref={bodyRef}
        scroll
      >
        <p
          aria-live="polite"
          className="search-result-status"
          role="status"
        >
          {state.status === "loading"
            ? "正在搜索。"
            : state.submitted
              ? `找到 ${groups.length} 个资源，${state.results.length} 个命中。`
              : "尚未执行搜索。"}
        </p>

        {state.status === "idle" ? (
          <EmptyState
            description="在左侧输入搜索词并选择范围，然后按 Enter 或搜索按钮。"
            title="搜索笔记与任务"
          />
        ) : state.status === "loading" ? (
          <EmptyState
            description="正在读取所选领域和仓库。"
            title="正在搜索"
          />
        ) : state.errorMessage && groups.length === 0 ? (
          <EmptyState
            action={(
              <Button
                onClick={() => void controller.search()}
                type="button"
                variant="primary"
              >
                重新搜索
              </Button>
            )}
            description={state.errorMessage}
            title="搜索失败"
          />
        ) : allSourcesFailed ? (
          <EmptyState
            action={(
              <Button
                onClick={() => void controller.search()}
                type="button"
                variant="primary"
              >
                重试
              </Button>
            )}
            description="所选搜索来源当前均不可读取。"
            title="搜索来源不可用"
          />
        ) : (
          <>
            {state.faults.length > 0 ? (
              <section
                aria-label="不可用的搜索来源"
                className="search-faults"
                role="status"
              >
                <strong>部分来源不可用</strong>
                <ul>
                  {state.faults.map((fault) => (
                    <li
                      key={`${fault.domain}:${fault.repositoryId ?? ""}:${
                        fault.code
                      }`}
                    >
                      {domainLabels[fault.domain]}
                      {fault.repositoryId
                        ? ` · ${
                            repositoryLabelById.get(fault.repositoryId) ??
                              fault.repositoryId
                          }`
                        : ""}
                      ：{fault.message}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {groups.length === 0 ? (
              <EmptyState
                description="当前搜索词和筛选条件没有匹配内容。"
                title="没有结果"
              />
            ) : (
              <ol className="search-result-groups" aria-label="搜索结果列表">
                {groups.map((group) => {
                  const repositoryLabel = group.repositoryId
                    ? repositoryLabelById.get(group.repositoryId) ??
                      group.repositoryId
                    : null;

                  return (
                    <li className="search-result-group" key={group.key}>
                      <header>
                        <h3>{group.title}</h3>
                        <p>
                          {domainLabels[group.domain]}
                          {repositoryLabel ? ` · ${repositoryLabel}` : ""}
                          {" · "}
                          {formatTimestamp(group.updatedAt)}
                        </p>
                      </header>
                      <ul>
                        {group.hits.map((hit) => (
                          <li key={hit.blockId ?? "document"}>
                            <button
                              aria-label={`打开${group.title}${
                                hit.blockId ? "中的匹配块" : "的整篇匹配"
                              }`}
                              className="search-result-hit"
                              onClick={() => onOpenResult(hit)}
                              type="button"
                            >
                              <span className="search-result-hit-kind">
                                {hit.blockId ? "块匹配" : "整篇匹配"}
                              </span>
                              <span>{hit.snippet}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
            {state.errorMessage && groups.length > 0 ? (
              <p className="search-page-error" role="alert">
                {state.errorMessage}
              </p>
            ) : null}
            {state.cursor ? (
              <div className="search-load-more">
                <Button
                  disabled={state.loadingMore}
                  onClick={() => void controller.loadMore()}
                  type="button"
                >
                  {state.loadingMore ? "正在加载…" : "加载更多"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
