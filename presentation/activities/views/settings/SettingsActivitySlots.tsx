import "../../../ui/styles/activities/settings.css";
import type { ActivitySlots } from "../../../ui/activityTypes";
import {
  SettingsContext,
  SettingsPanel,
  type SettingsSection,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";
import type { ApiAccessApplication } from "../../../../application/apiAccess/apiAccessAdministration";

export function createSettingsActivitySlots({
  apiAccess = {
    reason: "浏览器本地存储不会暴露远程 API。请使用服务器存储模式。",
    status: "unavailable",
  },
  onSectionChange = () => undefined,
  section = "interface",
  workbench,
}: {
  apiAccess?: ApiAccessApplication;
  onSectionChange?(section: SettingsSection): void;
  section?: SettingsSection;
  workbench: SettingsWorkbenchPreferences;
}): ActivitySlots {
  return {
    context: {
      content: (
        <SettingsContext
          onSectionChange={onSectionChange}
          section={section}
        />
      ),
      title: "设置",
    },
    detail: null,
    main: (
      <SettingsPanel
        apiAccess={apiAccess}
        section={section}
        workbench={workbench}
      />
    ),
  };
}
