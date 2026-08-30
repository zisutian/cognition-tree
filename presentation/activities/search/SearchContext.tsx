import { Search } from "lucide-react";
import {
  searchDraftsEqual,
  type SearchControllerView,
  type SearchControllerState,
} from "../../../application/search/searchController";
import {
  searchDomains,
  type SearchDomain,
} from "../../../application/search/searchTypes";
import { ChoiceGroup, InputControl } from "../../ui/shared/controls";
import { Button } from "../../ui/shared/primitives";

const domainOptions = [
  { label: "本地仓库", value: "workspace" },
  { label: "日记", value: "journal" },
  { label: "代办", value: "todo" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: SearchDomain;
}>;

export function SearchContext({
  controller,
  state,
}: {
  controller: SearchControllerView;
  state: SearchControllerState;
}) {
  const draftChanged = state.submitted !== null &&
    !searchDraftsEqual(state.draft, state.submitted);
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
        <InputControl
          autoComplete="off"
          id="workbench-search-query"
          onChange={(event) =>
            controller.updateDraft({ query: event.currentTarget.value })}
          placeholder="输入标题或正文"
          sizing="container"
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

      <ChoiceGroup
        ariaLabel="搜索范围"
        mode="multiple"
        onChange={(domains) => controller.updateDraft({
          domains: searchDomains.filter((domain) => domains.includes(domain)),
        })}
        options={domainOptions}
        values={state.draft.domains}
      />

      {state.draft.domains.length === 0 ? (
        <p className="search-context-status" role="alert">
          至少选择一个范围。
        </p>
      ) : draftChanged ? (
        <p className="search-context-status" role="status">
          条件已修改。
        </p>
      ) : null}
    </form>
  );
}
