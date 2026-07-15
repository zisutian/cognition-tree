import { createSettingsViewModel } from "../../application/workspace/activities/settings/settingsViewModel";
import AppView from "../../ui/AppView";
import { createSettingsActivitySlots } from "../../ui/activities/settings/SettingsActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

export function SettingsActivityController({
  active,
  application,
  onActiveActivityChange,
  workbench,
}: WorkspaceActivityControllerProps) {
  const view = createSettingsViewModel({
    ...application.repository,
    contextWidth: workbench.layout.contextResizeValue,
    setContextWidth: workbench.setContextWidth,
  });

  return active ? (
    <AppView
      activeActivityId="settings"
      createActivitySlots={() => createSettingsActivitySlots(view)}
      onActiveActivityChange={onActiveActivityChange}
      workbench={workbench}
    />
  ) : null;
}
