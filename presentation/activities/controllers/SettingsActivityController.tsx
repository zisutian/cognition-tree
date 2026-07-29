import { useState } from "react";
import { createSettingsActivitySlots } from "../views/settings/SettingsActivitySlots";
import type { SettingsSection } from "../views/settings/SettingsPanel";
import type { ActivityControllerProps } from "./activityController";

export function SettingsActivityController({
  active,
  application,
  renderActivity,
}: ActivityControllerProps) {
  const [section, setSection] = useState<SettingsSection>("interface");

  return active
    ? renderActivity(({ contextWidth, onContextWidthChange }) =>
        createSettingsActivitySlots({
          apiAccess: application.apiAccess,
          onSectionChange: setSection,
          section,
          workbench: { contextWidth, onContextWidthChange },
        }),
      )
    : null;
}
