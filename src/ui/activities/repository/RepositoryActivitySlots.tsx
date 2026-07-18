import type { RepositoryViewModel } from "../../../application/workspace/activities/repository/repositoryViewModel";
import type { WorkspaceRepositoryIssueFocusRequest } from "../../../application/workspace/navigation/useWorkspaceNavigation";
import "../../styles/activities/repository.css";
import type { ActivitySlots } from "../../activityTypes";
import {
  RepositoryContext,
  RepositoryPanel,
} from "./RepositoryPanel";

export function createRepositoryActivitySlots({
  onConsumeRepositoryIssueFocusRequest,
  repositoryIssueFocusRequest,
  view,
}: {
  onConsumeRepositoryIssueFocusRequest: (requestId: number) => void;
  repositoryIssueFocusRequest: WorkspaceRepositoryIssueFocusRequest | null;
  view: RepositoryViewModel;
}): ActivitySlots {
  return {
    context: {
      content: (
        <RepositoryContext
          focusRequest={repositoryIssueFocusRequest}
          onConsumeFocusRequest={onConsumeRepositoryIssueFocusRequest}
          view={view}
        />
      ),
      title: "仓库",
    },
    detail: null,
    main: <RepositoryPanel view={view} />,
  };
}
