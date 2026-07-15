import { createSettingsViewModel } from "../../application/workspace/activities/settings/settingsViewModel";
import { createSettingsActivitySlots } from "../../ui/activities/settings/SettingsActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

export function SettingsActivityController({
  active,
  application,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  const view = createSettingsViewModel(application.repository);

  return active
    ? renderActivity(({ contextWidth, onContextWidthChange }) =>
        createSettingsActivitySlots({
          view,
          workbench: { contextWidth, onContextWidthChange },
        }),
      )
    : null;
}
