// SPDX-License-Identifier: GPL-3.0-or-later

import { Bot, ClipboardList, KeyRound, PanelLeft, ServerCog } from "lucide-react";
import type { AgentApplication } from "../../../application/agent";
import {
  CompactContextList,
  CompactContextRow,
} from "../../ui/shared/CompactContextList";
import { ApiAccessSettingsPanel } from "./ApiAccessSettingsPanel";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import type {
  AgentSettingsRoute,
  ApiAccessSelection,
  SettingsSection,
} from "./settingsTypes";
import type {
  ApiAccessSettingsPanelView,
} from "./useApiAccessSettingsSession";
import {
  SystemSettingsPanel,
  type SystemSettingsPanelApplication,
} from "./SystemSettingsPanel";
import { OperationsSettingsPanel } from "./OperationsSettingsPanel";
import type {
  OperationsSettingsPanelView,
} from "./useOperationsSettingsSession";
import {
  InterfaceSettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./InterfaceSettingsPanel";
import type {
  SystemOwnerCredentialPanelView,
} from "./useSystemOwnerCredentialSession";

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
  agentRoute,
  apiAccessSession,
  apiAccessSelection = { kind: "overview" },
  onAgentRouteChange,
  onApiAccessSelectionChange = () => undefined,
  operationsSession,
  section = "interface",
  system,
  systemOwnerCredentialSession,
  workbench,
}: {
  agent: AgentApplication;
  agentRoute: AgentSettingsRoute;
  apiAccessSession: ApiAccessSettingsPanelView;
  apiAccessSelection?: ApiAccessSelection;
  onAgentRouteChange: (route: AgentSettingsRoute) => void;
  onApiAccessSelectionChange?: (selection: ApiAccessSelection) => void;
  operationsSession: OperationsSettingsPanelView;
  section?: SettingsSection;
  system: SystemSettingsPanelApplication;
  systemOwnerCredentialSession: SystemOwnerCredentialPanelView;
  workbench: SettingsWorkbenchPreferences;
}) {
  if (section === "agent") {
    return (
      <AgentSettingsPanel
        agent={agent}
        onRouteChange={onAgentRouteChange}
        route={agentRoute}
      />
    );
  }
  if (section === "system") {
    return (
      <SystemSettingsPanel
        ownerCredentialSession={systemOwnerCredentialSession}
        system={system}
      />
    );
  }
  if (section === "api-access") {
    return (
      <ApiAccessSettingsPanel
        onSelectionChange={onApiAccessSelectionChange}
        selection={apiAccessSelection}
        session={apiAccessSession}
      />
    );
  }
  if (section === "audit") {
    return (
      <OperationsSettingsPanel session={operationsSession} />
    );
  }
  return <InterfaceSettingsPanel workbench={workbench} />;
}
