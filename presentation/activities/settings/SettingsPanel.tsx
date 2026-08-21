// SPDX-License-Identifier: GPL-3.0-or-later

import { Bot, KeyRound, PanelLeft } from "lucide-react";
import type { AgentApplication } from "../../../application/agent";
import type {
  ApiAccessApplication,
} from "../../../application/apiAccess/apiAccessAdministration";
import { cx } from "../../ui/shared/primitives";
import { ApiAccessSettingsPanel } from "./ApiAccessSettingsPanel";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import {
  InterfaceSettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./InterfaceSettingsPanel";

export type SettingsSection = "agent" | "api-access" | "interface";
export type { SettingsWorkbenchPreferences } from "./InterfaceSettingsPanel";

const settingsSections = [
  { icon: PanelLeft, id: "interface", label: "界面" },
  { icon: Bot, id: "agent", label: "智能体" },
  { icon: KeyRound, id: "api-access", label: "API 访问" },
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
  apiAccess,
  section = "interface",
  workbench,
}: {
  agent: AgentApplication;
  apiAccess: ApiAccessApplication;
  section?: SettingsSection;
  workbench: SettingsWorkbenchPreferences;
}) {
  if (section === "agent") return <AgentSettingsPanel agent={agent} />;
  if (section === "api-access") {
    return <ApiAccessSettingsPanel apiAccess={apiAccess} />;
  }
  return <InterfaceSettingsPanel workbench={workbench} />;
}
