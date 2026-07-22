import "../../../ui/styles/activities/settings.css";
import type { ActivitySlots } from "../../../ui/activityTypes";
import {
  SettingsContext,
  SettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";

export function createSettingsActivitySlots({
  workbench,
}: {
  workbench: SettingsWorkbenchPreferences;
}): ActivitySlots {
  return {
    context: {
      content: <SettingsContext />,
      title: "设置",
    },
    detail: null,
    main: <SettingsPanel workbench={workbench} />,
  };
}
