import { createRepositoryViewModel } from "../../application/workspace/activities/repository/repositoryViewModel";
import { createRepositoryActivitySlots } from "../../ui/activities/repository/RepositoryActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

export function RepositoryActivityController({
  active,
  application,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  const view = createRepositoryViewModel(application.repository);

  return active
    ? renderActivity(() =>
        createRepositoryActivitySlots({
          onConsumeRepositoryIssueFocusRequest:
            application.navigation.consumeRepositoryIssueFocusRequest,
          repositoryIssueFocusRequest:
            application.navigation.repositoryIssueFocusRequest,
          view,
        }),
      )
    : null;
}
