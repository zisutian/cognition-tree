// SPDX-License-Identifier: GPL-3.0-or-later

import { Bot, ClipboardList, KeyRound, PanelLeft, ServerCog } from "lucide-react";
import type { AgentApplication } from "../../../application/agent";
import type {
  ApiAccessApplication,
} from "../../../application/apiAccess/apiAccessAdministration";
import { cx } from "../../ui/shared/primitives";
import { ApiAccessSettingsPanel } from "./ApiAccessSettingsPanel";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import type { AgentSettingsPage } from "./AgentSettingsPanel";
import type { SystemApplication } from "../../../application/system";
import { SystemSettingsPanel } from "./SystemSettingsPanel";
import type { OperationApplication } from "../../../application/operations/operationAdministration";
import { OperationsSettingsPanel } from "./OperationsSettingsPanel";
import {
  InterfaceSettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./InterfaceSettingsPanel";

export type SettingsSection = "agent" | "api-access" | "audit" | "interface" | "system";
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
      <ul className="ui-tree settings-list">
        {settingsSections.map(({ icon: Icon, id, label }) => {
          const selected = section === id;

          return (
            <li
              className={cx(
                "ui-tree-row-frame settings-row-frame",
                selected && "is-selected",
              )}
              key={id}
            >
              <button
                aria-current={selected ? "page" : undefined}
                className={cx(
                  "ui-tree-row settings-row",
                  selected && "is-selected",
                )}
                onClick={() => onSectionChange(id)}
                type="button"
              >
                <Icon aria-hidden="true" size={13} />
                <span className="ui-tree-text">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SettingsPanel({
  agent,
  agentPage = "overview",
  apiAccess,
  onAgentPageChange = () => undefined,
  operations,
  section = "interface",
  system,
  workbench,
}: {
  agent: AgentApplication;
  agentPage?: AgentSettingsPage;
  apiAccess: ApiAccessApplication;
  onAgentPageChange?: (page: AgentSettingsPage) => void;
  operations: OperationApplication;
  section?: SettingsSection;
  system: SystemApplication;
  workbench: SettingsWorkbenchPreferences;
}) {
  if (section === "agent") {
    return (
      <AgentSettingsPanel
        agent={agent}
        onPageChange={onAgentPageChange}
        page={agentPage}
      />
    );
  }
  if (section === "system") return <SystemSettingsPanel system={system} />;
  if (section === "api-access") {
    return <ApiAccessSettingsPanel apiAccess={apiAccess} />;
  }
  if (section === "audit") {
    return <OperationsSettingsPanel operations={operations} />;
  }
  return <InterfaceSettingsPanel workbench={workbench} />;
}
