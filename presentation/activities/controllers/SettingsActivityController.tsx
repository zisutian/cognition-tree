import { createSettingsActivitySlots } from "../views/settings/SettingsActivitySlots";
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
