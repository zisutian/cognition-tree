import { useLayoutEffect, useRef } from "react";
import type {
  SearchDomain,
  SearchResult,
} from "../../../application/search/index.ts";
import {
  searchDraftsEqual,
  type SearchControllerState,
  type SearchControllerView,
} from "../../../application/search/index.ts";
import {
  Button,
  createClassNames,
  EmptyState,
  Page,
  PageBody,
  Section,
  SectionStack,
  StatusBadge,
  ToolDivider,
  ToolList,
  ToolListRow,
} from "../../ui/index.ts";
import searchStyles from "./search.module.css";
const cx = createClassNames(searchStyles);

import {
  searchDomainLabels,
  type SearchRepositoryOption,
} from "./searchViewTypes.ts";

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
    const key = `${result.domain}:${result.repositoryId ?? ""}:${result.resourceId}`;
    const group = groups.get(key);

    if (group) {
      if (!group.hits.some(({ blockId }) => blockId === result.blockId)) {
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
      ...(result.repositoryId ? { repositoryId: result.repositoryId } : {}),
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
  controller: SearchControllerView;
  onOpenResult(result: SearchResult): void;
  repositories: SearchRepositoryOption[];
  state: SearchControllerState;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const groups = groupSearchResults(state.results);
  const repositoryLabelById = new Map(
    repositories.map(({ id, label }) => [id, label]),
  );
  const allSourcesFailed =
    state.faults.length > 0 && groups.length === 0 && !state.errorMessage;
  const draftChanged =
    state.submitted !== null &&
    !searchDraftsEqual(state.draft, state.submitted);

  useLayoutEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = controller.getScrollTop();
    }
  }, [controller, state.submitted]);

  return (
    <Page
      actions={
        state.submitted ? (
          <>
            <span className={cx("search-header-counts")}>
              {groups.length} 个资源 · {state.results.length} 个命中
            </span>
            {draftChanged ? (
              <StatusBadge tone="warning">条件已修改</StatusBadge>
            ) : null}
          </>
        ) : null
      }
      aria-label="搜索结果"
    >
      <PageBody
        onScroll={(event) =>
          controller.updateScrollTop(event.currentTarget.scrollTop)
        }
        ref={bodyRef}
      >
        <p
          aria-live="polite"
          className={cx("ui-visually-hidden")}
          role="status"
        >
          {state.status === "loading"
            ? "正在搜索。"
            : state.submitted
              ? `找到 ${groups.length} 个资源，${state.results.length} 个命中。`
              : "尚未执行搜索。"}
        </p>

        {state.status === "idle" ? (
          <EmptyState compact title="尚未搜索" />
        ) : state.status === "loading" ? (
          <EmptyState compact title="正在搜索" />
        ) : state.errorMessage && groups.length === 0 ? (
          <EmptyState
            compact
            action={
              <Button
                onClick={() => void controller.search()}
                type="button"
                variant="primary"
              >
                重新搜索
              </Button>
            }
            description={state.errorMessage}
            title="搜索失败"
          />
        ) : allSourcesFailed ? (
          <EmptyState
            compact
            action={
              <Button
                onClick={() => void controller.search()}
                type="button"
                variant="primary"
              >
                重试
              </Button>
            }
            title="搜索来源不可用"
          />
        ) : (
          <>
            {state.faults.length > 0 ? (
              <section
                aria-label="不可用的搜索来源"
                className={cx("search-faults")}
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
                      {searchDomainLabels[fault.domain]}
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
              <EmptyState compact title="没有结果" />
            ) : (
              <SectionStack aria-label="搜索结果列表" role="list">
                {groups.map((group) => {
                  const repositoryLabel = group.repositoryId
                    ? (repositoryLabelById.get(group.repositoryId) ??
                      group.repositoryId)
                    : null;

                  return (
                    <Section
                      key={group.key}
                      role="listitem"
                      title={group.title}
                    >
                      <p className={cx("search-result-meta")}>
                        {searchDomainLabels[group.domain]}
                        {repositoryLabel ? ` · ${repositoryLabel}` : ""}
                        {" · "}
                        {formatTimestamp(group.updatedAt)}
                      </p>
                      <ToolList aria-label={`${group.title}的匹配项`}>
                        {group.hits.map((hit) => (
                          <ToolListRow
                            buttonProps={{
                              "aria-label": `打开${group.title}${
                                hit.blockId ? "中的匹配块" : "的整篇匹配"
                              }`,
                            }}
                            flow="wrap"
                            key={hit.blockId ?? "document"}
                            leading={
                              <span className={cx("search-result-kind")}>
                                {hit.blockId ? "块匹配" : "整篇匹配"}
                              </span>
                            }
                            main={
                              <span className={cx("search-result-snippet")}>
                                {hit.snippet}
                              </span>
                            }
                            onSelect={() => onOpenResult(hit)}
                          />
                        ))}
                      </ToolList>
                    </Section>
                  );
                })}
              </SectionStack>
            )}
            {state.errorMessage && groups.length > 0 ? (
              <p className={cx("search-page-error")} role="alert">
                {state.errorMessage}
              </p>
            ) : null}
            {state.cursor ? (
              <div className={cx("search-load-more")}>
                <ToolDivider />
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
      </PageBody>
    </Page>
  );
}
