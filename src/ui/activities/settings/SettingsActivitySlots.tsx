import type { SettingsViewModel } from "../../../application/workspace/activities/settings/settingsViewModel";
import "../../styles/activities/settings.css";
import type { ActivitySlots } from "../../activityTypes";
import { SettingsPanel } from "./SettingsPanel";

export function createSettingsActivitySlots(
  view: SettingsViewModel,
): ActivitySlots {
  return {
    context: null,
    detail: null,
    main: <SettingsPanel view={view} />,
  };
}
