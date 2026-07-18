import type { RepositoryViewModel } from "../../../application/workspace/activities/repository/repositoryViewModel";
import type { RepositoryFocusRequest } from "../../../application/repository/useRepositoryNavigation";
import "../../styles/activities/repository.css";
import type { ActivitySlots } from "../../activityTypes";
import {
  RepositoryContext,
  RepositoryPanel,
} from "./RepositoryPanel";

export function createRepositoryActivitySlots({
  focusRequest,
  onConsumeFocusRequest,
  view,
}: {
  focusRequest: RepositoryFocusRequest | null;
  onConsumeFocusRequest: (requestId: number) => void;
  view: RepositoryViewModel;
}): ActivitySlots {
  return {
    context: {
      content: (
        <RepositoryContext
          focusRequest={focusRequest}
          onConsumeFocusRequest={onConsumeFocusRequest}
          view={view}
        />
      ),
      title: "仓库",
    },
    detail: null,
    main: <RepositoryPanel view={view} />,
  };
}
