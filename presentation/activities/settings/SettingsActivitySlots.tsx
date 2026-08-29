import "./settings.css";
import type { ActivitySlots } from "../../ui/activityTypes";
import {
  SettingsContext,
  SettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";
import type { AgentApplication } from "../../../application/agent";
import type { SystemApplication } from "../../../application/system";
import type { AgentSettingsPage } from "./AgentSettingsPanel";
import {
  SettingsStatusPanel,
} from "./SettingsStatusPanel";
import type {
  AgentSettingsSelection,
  ApiAccessSelection,
  SettingsSection,
} from "./settingsTypes";
import type {
  ApiAccessSettingsView,
} from "./useApiAccessSettingsSession";
import type {
  SystemOwnerCredentialView,
} from "./useSystemOwnerCredentialSession";
import type {
  OperationsSettingsPanelView,
  OperationsSettingsStatusView,
  OperationsSettingsView,
} from "./useOperationsSettingsSession";
import type {
  SystemSettingsPanelApplication,
} from "./SystemSettingsPanel";

export function createSettingsActivitySlots({
  agent,
  agentPage = "overview",
  agentSelection = { kind: "overview" },
  apiAccessSession,
  apiAccessSelection = { kind: "overview" },
  onAgentPageChange = () => undefined,
  onAgentSelectionChange = () => undefined,
  onApiAccessSelectionChange = () => undefined,
  onCollapseDetail,
  onSectionChange = () => undefined,
  operationsSession,
  section = "interface",
  system,
  systemOwnerCredentialSession,
  workbench,
}: {
  agent: AgentApplication;
  agentPage?: AgentSettingsPage;
  agentSelection?: AgentSettingsSelection;
  apiAccessSession: ApiAccessSettingsView;
  apiAccessSelection?: ApiAccessSelection;
  onAgentPageChange?(page: AgentSettingsPage): void;
  onAgentSelectionChange?(selection: AgentSettingsSelection): void;
  onApiAccessSelectionChange?(selection: ApiAccessSelection): void;
  onCollapseDetail(): void;
  onSectionChange?(section: SettingsSection): void;
  operationsSession: OperationsSettingsView;
  section?: SettingsSection;
  system: SystemApplication;
  systemOwnerCredentialSession: SystemOwnerCredentialView;
  workbench: SettingsWorkbenchPreferences;
}): ActivitySlots {
  const systemSettings = {
    authenticationController: {
      logout: () => system.authenticationController.logout(),
    },
    configurationController: {
      load: () => system.configurationController.load(),
      migrateDataRoot: (destination: string) =>
        system.configurationController.migrateDataRoot(destination),
      update: (request) => system.configurationController.update(request),
    },
    configurationState: system.configurationState,
  } satisfies SystemSettingsPanelApplication;
  const operationsPanelSession = {
    load: operationsSession.load,
    selectEntry: operationsSession.selectEntry,
    snapshot: operationsSession.snapshot,
  } satisfies OperationsSettingsPanelView;
  const operationsStatusSession = {
    snapshot: operationsSession.snapshot,
  } satisfies OperationsSettingsStatusView;

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
    detail: (
      <SettingsStatusPanel
        agent={agent}
        agentSelection={agentSelection}
        apiAccessSession={apiAccessSession}
        apiAccessSelection={apiAccessSelection}
        onCollapseDetail={onCollapseDetail}
        operationsSession={operationsStatusSession}
        section={section}
        systemConfigurationState={system.configurationState}
        systemOwnerCredentialSession={{
          dismissSecret: systemOwnerCredentialSession.dismissSecret,
          snapshot: systemOwnerCredentialSession.snapshot,
        }}
      />
    ),
    main: (
      <SettingsPanel
        agent={agent}
        agentPage={agentPage}
        apiAccessSession={apiAccessSession}
        apiAccessSelection={apiAccessSelection}
        onAgentPageChange={onAgentPageChange}
        onAgentSelectionChange={onAgentSelectionChange}
        onApiAccessSelectionChange={onApiAccessSelectionChange}
        agentSelection={agentSelection}
        operationsSession={operationsPanelSession}
        section={section}
        system={systemSettings}
        systemOwnerCredentialSession={{
          clearOwnerCredential:
            systemOwnerCredentialSession.clearOwnerCredential,
          dismissSecret: systemOwnerCredentialSession.dismissSecret,
          rotateOwnerCredential:
            systemOwnerCredentialSession.rotateOwnerCredential,
        }}
        workbench={workbench}
      />
    ),
  };
}
