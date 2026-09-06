import type {
  SearchControllerView,
  SearchControllerState,
  SearchResult,
} from "../../../application/search/index.ts";

import "./search.css";
import type { ActivitySlots } from "../../ui/index.ts";
import { SearchContext } from "./SearchContext.tsx";
import { SearchPanel } from "./SearchPanel.tsx";
import { SearchStatusPanel } from "./SearchStatusPanel.tsx";
import type { SearchRepositoryOption } from "./searchViewTypes.ts";

export function createSearchActivitySlots({
  controller,
  onCollapseDetail,
  onOpenResult,
  repositories,
  state,
}: {
  controller: SearchControllerView;
  onCollapseDetail: () => void;
  onOpenResult(result: SearchResult): void;
  repositories: SearchRepositoryOption[];
  state: SearchControllerState;
}): ActivitySlots {
  return {
    context: {
      content: <SearchContext controller={controller} state={state} />,
      title: "搜索",
    },
    detail:
      state.submitted || state.errorMessage ? (
        <SearchStatusPanel onCollapseDetail={onCollapseDetail} state={state} />
      ) : null,
    main: (
      <SearchPanel
        controller={controller}
        onOpenResult={onOpenResult}
        repositories={repositories}
        state={state}
      />
    ),
  };
}
