import { createRepositoryViewModel } from "../../application/workspace/activities/repository/repositoryViewModel";
import { createRepositoryActivitySlots } from "../../ui/activities/repository/RepositoryActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

export function RepositoryActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  const view = createRepositoryViewModel(application.repository);
  const navigatingView = {
    ...view,
    async createRepository(...input: Parameters<typeof view.createRepository>) {
      await view.createRepository(...input);
      onActiveActivityChange("notes");
    },
    async selectRepository(...input: Parameters<typeof view.selectRepository>) {
      await view.selectRepository(...input);
      onActiveActivityChange("notes");
    },
  };

  return active
    ? renderActivity(() =>
        createRepositoryActivitySlots({
          focusRequest: application.repository.navigation.focusRequest,
          onConsumeFocusRequest:
            application.repository.navigation.consumeFocusRequest,
          view: navigatingView,
        }),
      )
    : null;
}
