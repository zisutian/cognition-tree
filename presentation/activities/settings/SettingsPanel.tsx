// SPDX-License-Identifier: GPL-3.0-or-later

import { Bot, ClipboardList, KeyRound, PanelLeft, ServerCog } from "lucide-react";
import type { AgentApplication } from "../../../application/agent";
import type {
  ApiAccessApplication,
} from "../../../application/apiAccess/apiAccessAdministration";
import {
  CompactContextList,
  CompactContextRow,
} from "../../ui/shared/CompactContextList";
import { ApiAccessSettingsPanel } from "./ApiAccessSettingsPanel";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import type { AgentSettingsPage } from "./AgentSettingsPanel";
import type {
  AgentSettingsSelection,
  ApiAccessSelection,
  ApiAccessStatusSnapshot,
  OperationsStatusSnapshot,
  SettingsSection,
} from "./settingsTypes";
import type { SystemApplication } from "../../../application/system";
import { SystemSettingsPanel } from "./SystemSettingsPanel";
import type { OperationApplication } from "../../../application/operations/operationAdministration";
import { OperationsSettingsPanel } from "./OperationsSettingsPanel";
import {
  InterfaceSettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./InterfaceSettingsPanel";

export type { SettingsSection } from "./settingsTypes";
export type { SettingsWorkbenchPreferences } from "./InterfaceSettingsPanel";

const settingsSections = [
  { icon: PanelLeft, id: "interface", label: "界面" },
  { icon: ServerCog, id: "system", label: "服务" },
  { icon: Bot, id: "agent", label: "智能体" },
  { icon: KeyRound, id: "api-access", label: "API 访问" },
  { icon: ClipboardList, id: "audit", label: "审计" },
] as const;

export function SettingsContext({
  onSectionChange = () => undefined,
  section = "interface",
}: {
  onSectionChange?: (section: SettingsSection) => void;
  section?: SettingsSection;
}) {
  return (
    <div className="activity-context-content settings-context">
      <CompactContextList aria-label="设置页面">
        {settingsSections.map(({ icon: Icon, id, label }) => {
          const selected = section === id;

          return (
            <CompactContextRow
              icon={<Icon aria-hidden="true" size={13} />}
              key={id}
              label={label}
              onSelect={() => onSectionChange(id)}
              selected={selected}
              title={label}
            />
          );
        })}
      </CompactContextList>
    </div>
  );
}

export function SettingsPanel({
  agent,
  agentPage = "overview",
  agentSelection = { kind: "overview" },
  apiAccess,
  apiAccessSelection = { kind: "overview" },
  onAgentPageChange = () => undefined,
  onAgentSelectionChange = () => undefined,
  onApiAccessSelectionChange = () => undefined,
  onApiAccessSnapshotChange = () => undefined,
  onOperationsSelectedEntryIdChange = () => undefined,
  onOperationsSnapshotChange = () => undefined,
  operations,
  operationsSelectedEntryId = null,
  section = "interface",
  system,
  workbench,
}: {
  agent: AgentApplication;
  agentPage?: AgentSettingsPage;
  agentSelection?: AgentSettingsSelection;
  apiAccess: ApiAccessApplication;
  apiAccessSelection?: ApiAccessSelection;
  onAgentPageChange?: (page: AgentSettingsPage) => void;
  onAgentSelectionChange?: (selection: AgentSettingsSelection) => void;
  onApiAccessSelectionChange?: (selection: ApiAccessSelection) => void;
  onApiAccessSnapshotChange?: (snapshot: ApiAccessStatusSnapshot) => void;
  onOperationsSelectedEntryIdChange?: (entryId: string | null) => void;
  onOperationsSnapshotChange?: (snapshot: OperationsStatusSnapshot) => void;
  operations: OperationApplication;
  operationsSelectedEntryId?: string | null;
  section?: SettingsSection;
  system: SystemApplication;
  workbench: SettingsWorkbenchPreferences;
}) {
  if (section === "agent") {
    return (
      <AgentSettingsPanel
        agent={agent}
        selection={agentSelection}
        onPageChange={onAgentPageChange}
        onSelectionChange={onAgentSelectionChange}
        page={agentPage}
      />
    );
  }
  if (section === "system") return <SystemSettingsPanel system={system} />;
  if (section === "api-access") {
    return (
      <ApiAccessSettingsPanel
        apiAccess={apiAccess}
        onSelectionChange={onApiAccessSelectionChange}
        onStatusChange={onApiAccessSnapshotChange}
        selection={apiAccessSelection}
      />
    );
  }
  if (section === "audit") {
    return (
      <OperationsSettingsPanel
        onSelectedEntryIdChange={onOperationsSelectedEntryIdChange}
        onStatusChange={onOperationsSnapshotChange}
        operations={operations}
        selectedEntryId={operationsSelectedEntryId}
      />
    );
  }
  return <InterfaceSettingsPanel workbench={workbench} />;
}
