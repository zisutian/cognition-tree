import { Search } from "lucide-react";
import {
  searchDraftsEqual,
  type SearchControllerActions,
  type SearchControllerState,
} from "../../../application/search/searchController";
import {
  searchDomains,
  type SearchDomain,
} from "../../../application/search/searchTypes";
import { Button } from "../../ui/shared/primitives";
import type { SearchRepositoryOption } from "./searchViewTypes";

const domainLabels: Record<SearchDomain, string> = {
  journal: "日记",
  todo: "代办",
  workspace: "Workspace",
};

export function formatSearchDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return local.toISOString().slice(0, 16);
}

export function parseSearchDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function SearchContext({
  catalogStatus,
  controller,
  repositories,
  state,
}: {
  catalogStatus: "failed" | "loading" | "ready";
  controller: SearchControllerActions;
  repositories: SearchRepositoryOption[];
  state: SearchControllerState;
}) {
  const workspaceEnabled = state.draft.domains.includes("workspace");
  const selectedRepositoryIds = state.draft.repositoryIds === null
    ? new Set(repositories.map(({ id }) => id))
    : new Set(state.draft.repositoryIds);
  const draftChanged = state.submitted !== null &&
    !searchDraftsEqual(state.draft, state.submitted);
  const updateDomains = (domain: SearchDomain, checked: boolean) => {
    const selected = new Set(state.draft.domains);

    if (checked) selected.add(domain);
    else selected.delete(domain);
    controller.updateDraft({
      domains: searchDomains.filter((item) => selected.has(item)),
    });
  };
  const updateRepository = (repositoryId: string, checked: boolean) => {
    const selected = new Set(selectedRepositoryIds);

    if (checked) selected.add(repositoryId);
    else selected.delete(repositoryId);
    const allSelected = repositories.length > 0 &&
      repositories.every(({ id }) => selected.has(id));

    controller.updateDraft({
      repositoryIds: allSelected ? null : [...selected].sort(),
    });
  };
  const selectAllRepositories = () => {
    controller.updateDraft({ repositoryIds: null });
  };
  const clearRepositories = () => {
    controller.updateDraft({ repositoryIds: [] });
  };
  const canSearch = state.status !== "loading" &&
    state.draft.query.trim().length > 0 &&
    state.draft.domains.length > 0;

  return (
    <form
      aria-label="搜索条件"
      className="activity-context-content search-context"
      onSubmit={(event) => {
        event.preventDefault();
        void controller.search();
      }}
      role="search"
    >
      <div className="search-query-row">
        <label htmlFor="workbench-search-query">搜索词</label>
        <input
          autoComplete="off"
          className="ui-input"
          id="workbench-search-query"
          onChange={(event) =>
            controller.updateDraft({ query: event.currentTarget.value })}
          placeholder="输入标题或正文"
          type="search"
          value={state.draft.query}
        />
        <Button
          aria-label="搜索"
          disabled={!canSearch}
          title={state.status === "loading" ? "正在搜索" : "搜索"}
          type="submit"
          variant="icon"
        >
          <Search aria-hidden="true" size={14} />
        </Button>
      </div>

      <fieldset className="search-filter-group">
        <legend>领域</legend>
        {searchDomains.map((domain) => (
          <label key={domain}>
            <input
              checked={state.draft.domains.includes(domain)}
              onChange={(event) =>
                updateDomains(domain, event.currentTarget.checked)}
              type="checkbox"
            />
            <span>{domainLabels[domain]}</span>
          </label>
        ))}
      </fieldset>

      {workspaceEnabled ? (
        <fieldset className="search-filter-group">
          <legend className="search-filter-heading">
            <span>Workspace 仓库</span>
            <span className="search-filter-actions">
              <Button
                disabled={catalogStatus !== "ready" || repositories.length === 0}
                onClick={selectAllRepositories}
                type="button"
                variant="ghost"
              >
                全选
              </Button>
              <Button
                disabled={catalogStatus !== "ready" || repositories.length === 0}
                onClick={clearRepositories}
                type="button"
                variant="ghost"
              >
                清除
              </Button>
            </span>
          </legend>
          {catalogStatus === "loading" ? (
            <p className="search-context-status">正在读取仓库目录…</p>
          ) : catalogStatus === "failed" ? (
            <p className="search-context-status" role="alert">
              仓库目录当前不可用。
            </p>
          ) : repositories.length === 0 ? (
            <p className="search-context-status">没有普通仓库。</p>
          ) : (
            <div className="search-repository-list ui-scroll-surface">
              {repositories.map((repository) => (
                <label key={repository.id}>
                  <input
                    checked={selectedRepositoryIds.has(repository.id)}
                    onChange={(event) =>
                      updateRepository(
                        repository.id,
                        event.currentTarget.checked,
                      )}
                    type="checkbox"
                  />
                  <span>{repository.label}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ) : null}

      <details className="search-more-filters">
        <summary>
          更多条件
          {state.draft.updatedAfter ? <span>已设置</span> : null}
        </summary>
        <label className="search-field">
          <span>更新时间不早于</span>
          <input
            className="ui-input"
            onChange={(event) =>
              controller.updateDraft({
                updatedAfter: parseSearchDateTimeLocal(
                  event.currentTarget.value,
                ),
              })}
            type="datetime-local"
            value={formatSearchDateTimeLocal(state.draft.updatedAfter)}
          />
        </label>
      </details>

      {state.draft.domains.length === 0 ? (
        <p className="search-context-status" role="alert">
          至少选择一个领域。
        </p>
      ) : draftChanged ? (
        <p className="search-context-status" role="status">
          条件已修改，请重新搜索。
        </p>
      ) : null}

    </form>
  );
}
