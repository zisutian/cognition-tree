import "./settings.css";
import type { ActivitySlots } from "../../ui/activityTypes";
import {
  SettingsContext,
  SettingsPanel,
  type SettingsSection,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";
import type { ApiAccessApplication } from "../../../application/apiAccess/apiAccessAdministration";
import type { AgentApplication } from "../../../application/agent";
import type { SystemApplication } from "../../../application/system";

export function createSettingsActivitySlots({
  agent,
  apiAccess,
  onSectionChange = () => undefined,
  section = "interface",
  system,
  workbench,
}: {
  agent: AgentApplication;
  apiAccess: ApiAccessApplication;
  onSectionChange?(section: SettingsSection): void;
  section?: SettingsSection;
  system: SystemApplication;
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
        agent={agent}
        apiAccess={apiAccess}
        section={section}
        system={system}
        workbench={workbench}
      />
    ),
  };
}
