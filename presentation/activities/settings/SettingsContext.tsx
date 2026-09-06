// SPDX-License-Identifier: GPL-3.0-or-later

import { FileCog, Plus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentConfigurationState } from "../../../application/agent/index.ts";
import {
  Button,
  CompactContextGroup,
  CompactContextRow,
} from "../../ui/index.ts";
import type { ApiAccessSettingsPanelSnapshot } from "./useApiAccessSettingsSession.ts";
import {
  settingsPageLabels,
  settingsTargetKey,
  type SettingsTarget,
} from "./settingsTypes.ts";

type EntityKind = "provider" | "profile" | "automation" | "trusted";
export function SettingsContext({
  agent,
  api,
  blocked,
  onRefresh,
  onSelect,
  target,
}: {
  agent: AgentConfigurationState;
  api: ApiAccessSettingsPanelSnapshot;
  blocked: boolean;
  onRefresh(): void;
  onSelect(target: SettingsTarget): void;
  target: SettingsTarget;
}) {
  const row = (item: SettingsTarget, label: string) => {
    const key = settingsTargetKey(item),
      selected = key === settingsTargetKey(target);
    return (
      <CompactContextRow
        icon={<FileCog aria-hidden="true" size={13} />}
        key={key}
        label={label}
        onSelect={() => onSelect(item)}
        selected={selected}
        title={label}
        trailing={
          selected && blocked ? <span aria-label="待处理">●</span> : undefined
        }
      />
    );
  };
  const group = (
    id: string,
    label: string,
    children: ReactNode,
    actions?: ReactNode,
  ) => (
    <CompactContextGroup
      headingId={`settings-group-${id}`}
      label={label}
      listAriaLabel={label}
      actions={actions}
    >
      {children}
    </CompactContextGroup>
  );
  const entities = (
    kind: EntityKind,
    label: string,
    items: ReadonlyArray<{ id: string; label: string }>,
  ) =>
    group(
      kind,
      label,
      <>
        {items.map((item) => row({ kind, id: item.id }, item.label))}
        {target.kind === kind &&
        target.id !== null &&
        !items.some((item) => item.id === target.id)
          ? row(target, `已移除的${settingsPageLabels[kind]}`)
          : null}
        {target.kind === kind && "id" in target && target.id === null
          ? row({ kind, id: null }, `新建${settingsPageLabels[kind]}`)
          : null}
      </>,
      <Button
        aria-label={`新建 ${settingsPageLabels[kind]}`}
        onClick={() => onSelect({ kind, id: null })}
        title={`新建 ${settingsPageLabels[kind]}`}
        type="button"
        variant="icon"
      >
        <Plus aria-hidden="true" size={13} />
      </Button>,
    );
  return (
    <div className="activity-context-content settings-context">
      <div className="ui-actions">
        <Button
          aria-label="刷新设置状态"
          onClick={onRefresh}
          title="刷新设置状态"
          type="button"
          variant="icon"
        >
          <RefreshCw aria-hidden="true" size={13} />
        </Button>
      </div>
      {group("interface", "界面", row({ kind: "interface" }, "工作台布局"))}
      {group(
        "system",
        "服务",
        <>
          {(["network", "paths", "owner", "migration"] as const).map((kind) =>
            row({ kind }, settingsPageLabels[kind]),
          )}
        </>,
      )}
      {group(
        "agent",
        "智能体",
        <>
          {row({ kind: "agent-default" }, "默认会话配置")}
          {row({ kind: "agent-discovery" }, "本地服务发现")}
          <li className="settings-context-subgroup">
            {entities(
              "provider",
              "模型服务（Provider）",
              agent.configuration?.providers ?? [],
            )}
          </li>
          <li className="settings-context-subgroup">
            {entities(
              "profile",
              "会话配置（Profile）",
              agent.configuration?.profiles ?? [],
            )}
          </li>
        </>,
      )}
      {group(
        "api",
        "API 访问",
        <>
          <li className="settings-context-subgroup">
            {entities(
              "automation",
              "自动化令牌",
              api.tokens.map((item) => ({ id: item.id, label: item.name })),
            )}
          </li>
          <li className="settings-context-subgroup">
            {entities(
              "trusted",
              "可信客户端令牌",
              api.trustedClientTokens.map((item) => ({
                id: item.id,
                label: item.name,
              })),
            )}
          </li>
        </>,
      )}
      {group(
        "audit",
        "审计",
        <>
          {row({ kind: "audit" }, "操作记录")}
          {row({ kind: "audit-retention" }, "保留策略")}
        </>,
      )}
    </div>
  );
}
