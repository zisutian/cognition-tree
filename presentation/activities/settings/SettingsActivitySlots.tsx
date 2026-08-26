import "./settings.css";
import type { ActivitySlots } from "../../ui/activityTypes";
import {
  SettingsContext,
  SettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";
import type { ApiAccessApplication } from "../../../application/apiAccess/apiAccessAdministration";
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
  ApiAccessStatusSnapshot,
  OperationsStatusSnapshot,
  SettingsSection,
} from "./settingsTypes";

export function createSettingsActivitySlots({
  agent,
  agentPage = "overview",
  agentSelection = { kind: "overview" },
  apiAccess,
  apiAccessSelection = { kind: "overview" },
  apiAccessSnapshot = {
    dismissSecret: () => undefined,
    errorMessage: null,
    loading: true,
    secret: null,
    tokens: [],
    trustedClientTokens: [],
  },
  onAgentPageChange = () => undefined,
  onAgentSelectionChange = () => undefined,
  onApiAccessSelectionChange = () => undefined,
  onApiAccessSnapshotChange = () => undefined,
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
  workbench,
}: {
  agent: AgentApplication;
  agentPage?: AgentSettingsPage;
  agentSelection?: AgentSettingsSelection;
  apiAccess: ApiAccessApplication;
  apiAccessSelection?: ApiAccessSelection;
  apiAccessSnapshot?: ApiAccessStatusSnapshot;
  onAgentPageChange?(page: AgentSettingsPage): void;
  onAgentSelectionChange?(selection: AgentSettingsSelection): void;
  onApiAccessSelectionChange?(selection: ApiAccessSelection): void;
  onApiAccessSnapshotChange?(snapshot: ApiAccessStatusSnapshot): void;
  onCollapseDetail(): void;
  onOperationsSelectedEntryIdChange?(entryId: string | null): void;
  onOperationsSnapshotChange?(snapshot: OperationsStatusSnapshot): void;
  onSectionChange?(section: SettingsSection): void;
  operations: OperationApplication;
  operationsSelectedEntryId?: string | null;
  operationsSnapshot?: OperationsStatusSnapshot;
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
    detail: (
      <SettingsStatusPanel
        agent={agent}
        agentSelection={agentSelection}
        apiAccessSelection={apiAccessSelection}
        apiAccessSnapshot={apiAccessSnapshot}
        onCollapseDetail={onCollapseDetail}
        operationsSelectedEntryId={operationsSelectedEntryId}
        operationsSnapshot={operationsSnapshot}
        section={section}
        system={system}
      />
    ),
    main: (
      <SettingsPanel
        agent={agent}
        agentPage={agentPage}
        apiAccess={apiAccess}
        apiAccessSelection={apiAccessSelection}
        onAgentPageChange={onAgentPageChange}
        onAgentSelectionChange={onAgentSelectionChange}
        onApiAccessSelectionChange={onApiAccessSelectionChange}
        onApiAccessSnapshotChange={onApiAccessSnapshotChange}
        onOperationsSelectedEntryIdChange={onOperationsSelectedEntryIdChange}
        onOperationsSnapshotChange={onOperationsSnapshotChange}
        agentSelection={agentSelection}
        operations={operations}
        operationsSelectedEntryId={operationsSelectedEntryId}
        section={section}
        system={system}
        workbench={workbench}
      />
    ),
  };
}
