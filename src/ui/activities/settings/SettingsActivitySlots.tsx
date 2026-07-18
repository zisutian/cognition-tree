import type { SettingsViewModel } from "../../../application/workspace/activities/settings/settingsViewModel";
import "../../styles/activities/settings.css";
import type { ActivitySlots } from "../../activityTypes";
import {
  SettingsPanel,
  SettingsRepositoryContext,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";

export function createSettingsActivitySlots({
  view,
  workbench,
}: {
  view: SettingsViewModel;
  workbench: SettingsWorkbenchPreferences;
}): ActivitySlots {
  return {
    context: {
      content: <SettingsRepositoryContext view={view} />,
      title: "仓库",
    },
    detail: null,
    main: <SettingsPanel view={view} workbench={workbench} />,
  };
}
