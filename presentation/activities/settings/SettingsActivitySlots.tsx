import "./settings.css";
import type { ActivitySlots } from "../../ui/activityTypes";
import {
  SettingsContext,
  SettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";
import type { AgentApplication } from "../../../application/agent";
import type { SystemApplication } from "../../../application/system";
import type { OperationApplication } from "../../../application/operations/operationAdministration";
import type { AgentSettingsPage } from "./AgentSettingsPanel";
import {
  SettingsStatusPanel,
} from "./SettingsStatusPanel";
import type {
  AgentSettingsSelection,
  ApiAccessSelection,
  OperationsStatusSnapshot,
  SettingsSection,
} from "./settingsTypes";
import type {
  ApiAccessSettingsView,
} from "./useApiAccessSettingsSession";
import type {
  SystemOwnerCredentialView,
} from "./useSystemOwnerCredentialSession";
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
  onOperationsSelectedEntryIdChange = () => undefined,
  onOperationsSnapshotChange = () => undefined,
  onSectionChange = () => undefined,
  operations,
  operationsSelectedEntryId = null,
  operationsSnapshot = {
    entries: [],
    errorMessage: null,
    loading: true,
    status: null,
  },
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
  onOperationsSelectedEntryIdChange?(entryId: string | null): void;
  onOperationsSnapshotChange?(snapshot: OperationsStatusSnapshot): void;
  onSectionChange?(section: SettingsSection): void;
  operations: OperationApplication;
  operationsSelectedEntryId?: string | null;
  operationsSnapshot?: OperationsStatusSnapshot;
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
      getSnapshot: () => system.configurationController.getSnapshot(),
      migrateDataRoot: (destination: string) =>
        system.configurationController.migrateDataRoot(destination),
      update: (configuration) =>
        system.configurationController.update(configuration),
    },
    configurationState: system.configurationState,
  } satisfies SystemSettingsPanelApplication;

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
        operationsSelectedEntryId={operationsSelectedEntryId}
        operationsSnapshot={operationsSnapshot}
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
        onOperationsSelectedEntryIdChange={onOperationsSelectedEntryIdChange}
        onOperationsSnapshotChange={onOperationsSnapshotChange}
        agentSelection={agentSelection}
        operations={operations}
        operationsSelectedEntryId={operationsSelectedEntryId}
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
