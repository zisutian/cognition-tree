import type {
  SearchControllerActions,
  SearchControllerState,
} from "../../../../application/search/searchController";
import type { SearchResult } from "../../../../application/search/searchQuery";
import "../../../ui/styles/activities/search.css";
import type { ActivitySlots } from "../../../ui/activityTypes";
import { SearchContext } from "./SearchContext";
import { SearchPanel } from "./SearchPanel";
import type { SearchRepositoryOption } from "./searchViewTypes";

export function createSearchActivitySlots({
  catalogStatus,
  controller,
  onOpenResult,
  repositories,
  state,
}: {
  catalogStatus: "failed" | "loading" | "ready";
  controller: SearchControllerActions;
  onOpenResult(result: SearchResult): void;
  repositories: SearchRepositoryOption[];
  state: SearchControllerState;
}): ActivitySlots {
  return {
    context: {
      content: (
        <SearchContext
          catalogStatus={catalogStatus}
          controller={controller}
          repositories={repositories}
          state={state}
        />
      ),
      title: "搜索",
    },
    detail: null,
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
