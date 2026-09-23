import { Stack as SectionStack, StatusText as StatusBadge } from "compact-ui";
import {
  Button,
  EmptyState,
  FormActions,
  Section,
  List,
  ListRow,
} from "compact-ui";
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
import { createClassNames, Page, PageBody } from "../../ui/index.ts";
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
      summary={
        state.submitted ? (
          <>
            <StatusBadge>
              {groups.length} 个结果 · {state.results.length} 处匹配
            </StatusBadge>
            {draftChanged ? (
              <StatusBadge mode="live" tone="warning">
                条件已修改
              </StatusBadge>
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
          <EmptyState title="尚未搜索" />
        ) : state.status === "loading" ? (
          <EmptyState title="正在搜索" />
        ) : state.errorMessage && groups.length === 0 ? (
          <EmptyState
            action={
              <Button onClick={() => void controller.search()} type="button">
                重新搜索
              </Button>
            }
            title="搜索失败"
          />
        ) : allSourcesFailed ? (
          <EmptyState
            action={
              <Button onClick={() => void controller.search()} type="button">
                重试
              </Button>
            }
            title="搜索来源不可用"
          />
        ) : (
          <>
            {groups.length === 0 ? (
              <EmptyState title="没有结果" />
            ) : (
              <section aria-label="搜索结果列表">
                <SectionStack>
                  {groups.map((group) => {
                    const repositoryLabel = group.repositoryId
                      ? (repositoryLabelById.get(group.repositoryId) ??
                        group.repositoryId)
                      : null;

                    return (
                      <Section key={group.key} title={group.title}>
                        <StatusBadge>
                          {searchDomainLabels[group.domain]}
                          {repositoryLabel ? ` · ${repositoryLabel}` : ""}
                          {" · "}
                          {formatTimestamp(group.updatedAt)}
                        </StatusBadge>
                        <List aria-label={`${group.title}的匹配项`}>
                          {group.hits.map((hit) => (
                            <ListRow
                              key={hit.blockId ?? "document"}
                              layout="detailed"
                              title={
                                <span
                                  aria-label={`打开${group.title}${hit.blockId ? "中的匹配块" : "的整篇匹配"}`}
                                >
                                  {hit.blockId ? "块匹配" : "整篇匹配"}
                                </span>
                              }
                              description={
                                <span className={cx("search-result-snippet")}>
                                  {hit.snippet}
                                </span>
                              }
                              onSelect={() => onOpenResult(hit)}
                            />
                          ))}
                        </List>
                      </Section>
                    );
                  })}
                </SectionStack>
              </section>
            )}
            {state.cursor ? (
              <FormActions>
                <Button
                  disabled={state.loadingMore}
                  onClick={() => void controller.loadMore()}
                  type="button"
                >
                  {state.loadingMore ? "正在加载…" : "加载更多"}
                </Button>
              </FormActions>
            ) : null}
          </>
        )}
      </PageBody>
    </Page>
  );
}
