import type {
  SearchControllerView,
  SearchControllerState,
} from "../../../application/search/searchController";
import type { SearchResult } from "../../../application/search/searchTypes";
import "./search.css";
import type { ActivitySlots } from "../../ui/activityTypes";
import { SearchContext } from "./SearchContext";
import { SearchPanel } from "./SearchPanel";
import { SearchStatusPanel } from "./SearchStatusPanel";
import type { SearchRepositoryOption } from "./searchViewTypes";

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
      content: (
        <SearchContext
          controller={controller}
          state={state}
        />
      ),
      title: "搜索",
    },
    detail: (
      <SearchStatusPanel
        onCollapseDetail={onCollapseDetail}
        state={state}
      />
    ),
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
