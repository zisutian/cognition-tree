import type {
  SearchControllerState,
  SearchControllerView,
  SearchResult,
} from "../../../application/search/index.ts";

import type { ActivitySlots } from "../../ui/index.ts";
import { SearchContext } from "./SearchContext.tsx";
import { SearchPanel } from "./SearchPanel.tsx";
import { SearchStatusPanel } from "./SearchStatusPanel.tsx";
import type { SearchRepositoryOption } from "./searchViewTypes.ts";

export function createSearchActivitySlots({
  controller,
  onOpenResult,
  repositories,
  state,
}: {
  controller: SearchControllerView;
  onOpenResult(result: SearchResult): void;
  repositories: SearchRepositoryOption[];
  state: SearchControllerState;
}): ActivitySlots {
  return {
    context: {
      layout: "form",
      content: <SearchContext controller={controller} state={state} />,
      title: "搜索",
    },
    detail:
      state.submitted || state.errorMessage
        ? {
            title: "搜索状态",
            layout: "detail",
            content: <SearchStatusPanel state={state} />,
          }
        : null,
    main: {
      title: state.submitted ? `搜索 · ${state.submitted.query}` : "搜索结果",
      layout: "results",
      content: (
        <SearchPanel
          controller={controller}
          onOpenResult={onOpenResult}
          repositories={repositories}
          state={state}
        />
      ),
    },
  };
}
