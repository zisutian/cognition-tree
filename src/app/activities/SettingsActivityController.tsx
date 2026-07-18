import { createSettingsActivitySlots } from "../../ui/activities/settings/SettingsActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

export function SettingsActivityController({
  active,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  return active
    ? renderActivity(({ contextWidth, onContextWidthChange }) =>
        createSettingsActivitySlots({
          workbench: { contextWidth, onContextWidthChange },
        }),
      )
    : null;
}
