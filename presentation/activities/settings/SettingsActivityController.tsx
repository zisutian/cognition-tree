import { useState } from "react";
import { createSettingsActivitySlots } from "./SettingsActivitySlots";
import type { SettingsSection } from "./SettingsPanel";
import type { ActivityControllerProps } from "../activityController";

export function SettingsActivityController({
  active,
  application,
  renderActivity,
}: ActivityControllerProps) {
  const [section, setSection] = useState<SettingsSection>("interface");

  return active
    ? renderActivity(({ contextWidth, onContextWidthChange }) =>
        createSettingsActivitySlots({
          agent: application.agent,
          apiAccess: application.apiAccess,
          onSectionChange: setSection,
          operations: application.operations,
          section,
          system: application.system,
          workbench: { contextWidth, onContextWidthChange },
        }),
      )
    : null;
}
