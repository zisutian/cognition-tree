import {
  Button,
  ChoiceGroup,
  FieldRow,
  FormActions,
  FormLayout,
  InputControl,
} from "compact-ui";
import { Search } from "lucide-react";
import {
  searchDomains,
  type SearchControllerState,
  type SearchControllerView,
  type SearchDomain,
} from "../../../application/search/index.ts";
import { FormError } from "../../ui/index.ts";

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
  const canSearch =
    state.status !== "loading" &&
    state.draft.query.trim().length > 0 &&
    state.draft.domains.length > 0;

  return (
    <section role="search" aria-label="搜索条件">
      <FormLayout
        layout="stacked"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.search();
        }}
      >
        <FieldRow label="搜索词" fieldId="workbench-search-query">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              autoComplete="off"
              id="workbench-search-query"
              onChange={(event) =>
                controller.updateDraft({ query: event.currentTarget.value })
              }
              placeholder="标题或正文"
              sizing="container"
              type="search"
              value={state.draft.query}
            />
          )}
        </FieldRow>
        <FormActions>
          <Button
            aria-label="搜索"
            disabled={!canSearch}
            title={state.status === "loading" ? "正在搜索" : "搜索"}
            type="submit"
            variant="icon"
          >
            <Search aria-hidden="true" size={14} />
          </Button>
        </FormActions>

        <ChoiceGroup
          ariaLabel="搜索范围"
          mode="multiple"
          onChange={(domains) =>
            controller.updateDraft({
              domains: searchDomains.filter((domain) =>
                domains.includes(domain),
              ),
            })
          }
          options={domainOptions}
          values={state.draft.domains}
        />

        {state.draft.domains.length === 0 ? (
          <FormError message="至少选择一个范围。" />
        ) : null}
      </FormLayout>
    </section>
  );
}
