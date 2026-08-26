import { useState } from "react";
import { createSettingsActivitySlots } from "./SettingsActivitySlots";
import type { SettingsSection } from "./SettingsPanel";
import type { AgentSettingsPage } from "./AgentSettingsPanel";
import type { ActivityControllerProps } from "../activityController";

export function SettingsActivityController({
  active,
  application,
  renderActivity,
}: ActivityControllerProps) {
  const [section, setSection] = useState<SettingsSection>("interface");
  const [agentPage, setAgentPage] = useState<AgentSettingsPage>("overview");

  return active
    ? renderActivity(({ contextWidth, onContextWidthChange }) =>
        createSettingsActivitySlots({
          agent: application.agent,
          agentPage,
          apiAccess: application.apiAccess,
          onAgentPageChange: setAgentPage,
          onSectionChange: setSection,
          operations: application.operations,
          section,
          system: application.system,
          workbench: { contextWidth, onContextWidthChange },
        }),
      )
    : null;
}
