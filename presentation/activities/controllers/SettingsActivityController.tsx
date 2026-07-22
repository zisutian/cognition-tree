import { createSettingsActivitySlots } from "../views/settings/SettingsActivitySlots";
import type { ActivityControllerProps } from "./activityController";

export function SettingsActivityController({
  active,
  renderActivity,
}: ActivityControllerProps) {
  return active
    ? renderActivity(({ contextWidth, onContextWidthChange }) =>
        createSettingsActivitySlots({
          workbench: { contextWidth, onContextWidthChange },
        }),
      )
    : null;
}
