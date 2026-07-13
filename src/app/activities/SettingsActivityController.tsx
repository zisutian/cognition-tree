import AppView from "../../ui/AppView";
import { createSettingsActivitySlots } from "../../ui/activities/settings/SettingsActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

export function SettingsActivityController({
  active,
  application,
  onActiveActivityChange,
  workbench,
}: WorkspaceActivityControllerProps) {
  return active ? (
    <AppView
      activeActivityId="settings"
      createActivitySlots={() =>
        createSettingsActivitySlots(application.settings)
      }
      onActiveActivityChange={onActiveActivityChange}
      workbench={workbench}
    />
  ) : null;
}
