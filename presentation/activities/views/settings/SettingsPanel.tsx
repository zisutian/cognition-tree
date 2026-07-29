// SPDX-License-Identifier: GPL-3.0-or-later

import { KeyRound, PanelLeft } from "lucide-react";
import type {
  ApiAccessApplication,
} from "../../../../application/apiAccess/apiAccessAdministration";
import { cx } from "../../../ui/shared/primitives";
import { ApiAccessSettingsPanel } from "./ApiAccessSettingsPanel";
import {
  InterfaceSettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./InterfaceSettingsPanel";

export type SettingsSection = "api-access" | "interface";
export type { SettingsWorkbenchPreferences } from "./InterfaceSettingsPanel";

const settingsSections = [
  { icon: PanelLeft, id: "interface", label: "界面" },
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

const unavailableApiAccess: ApiAccessApplication = {
  reason: "浏览器本地存储不会暴露远程 API。请使用服务器存储模式。",
  status: "unavailable",
};

export function SettingsPanel({
  apiAccess = unavailableApiAccess,
  section = "interface",
  workbench,
}: {
  apiAccess?: ApiAccessApplication;
  section?: SettingsSection;
  workbench: SettingsWorkbenchPreferences;
}) {
  return section === "api-access"
    ? <ApiAccessSettingsPanel apiAccess={apiAccess} />
    : <InterfaceSettingsPanel workbench={workbench} />;
}
