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
import type { OperationApplication } from "../../../application/operations/operationAdministration";
import type { AgentSettingsPage } from "./AgentSettingsPanel";

export function createSettingsActivitySlots({
  agent,
  agentPage = "overview",
  apiAccess,
  onAgentPageChange = () => undefined,
  onSectionChange = () => undefined,
  operations,
  section = "interface",
  system,
  workbench,
}: {
  agent: AgentApplication;
  agentPage?: AgentSettingsPage;
  apiAccess: ApiAccessApplication;
  onAgentPageChange?(page: AgentSettingsPage): void;
  onSectionChange?(section: SettingsSection): void;
  operations: OperationApplication;
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
        agentPage={agentPage}
        apiAccess={apiAccess}
        onAgentPageChange={onAgentPageChange}
        operations={operations}
        section={section}
        system={system}
        workbench={workbench}
      />
    ),
  };
}
