import { Tree, type TreeNode } from "compact-ui";
import { useState } from "react";
import type { AgentConfigurationState } from "../../../application/agent/index.ts";
import {
  settingsPageLabels,
  settingsTargetKey,
  type SettingsTarget,
} from "./settingsTypes.ts";
export function SettingsContext({
  agent,
  blocked,
  onSelect,
  target,
}: {
  agent: AgentConfigurationState;
  blocked: boolean;
  onSelect(target: SettingsTarget, intent?: "preview" | "pinned"): void;
  target: SettingsTarget;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () =>
      new Set([
        "group:interface",
        "group:system",
        "group:agent",
        "group:provider",
        "group:profile",
        "group:api",
        "group:audit",
      ]),
  );
  const targets = new Map<string, SettingsTarget>();
  const row = (item: SettingsTarget, label: string): TreeNode => {
    const id = settingsTargetKey(item);
    targets.set(id, item);
    return { id, label, disabled: blocked && id !== settingsTargetKey(target) };
  };
  const group = (
    id: string,
    label: string,
    children: TreeNode[],
  ): TreeNode => ({
    id: `group:${id}`,
    label,
    canHaveChildren: true,
    children,
  });
  const entities = (
    kind: "provider" | "profile",
    items: readonly { id: string; label: string }[],
  ) =>
    group(
      kind,
      kind === "provider" ? "模型服务（Provider）" : "会话配置（Profile）",
      [
        ...items.map((item) => row({ kind, id: item.id }, item.label)),
        row({ kind, id: null }, `新建 ${settingsPageLabels[kind]}`),
      ],
    );
  const nodes = [
    group("interface", "界面", [row({ kind: "interface" }, "工作台布局")]),
    group(
      "system",
      "服务",
      (["network", "paths", "owner", "migration"] as const).map((kind) =>
        row({ kind }, settingsPageLabels[kind]),
      ),
    ),
    group("agent", "智能体", [
      row({ kind: "agent-default" }, "默认会话配置"),
      row({ kind: "agent-discovery" }, "本地服务发现"),
      entities("provider", agent.configuration?.providers ?? []),
      entities("profile", agent.configuration?.profiles ?? []),
    ]),
    group("api", "API 访问", [row({ kind: "local-api" }, "本机 API")]),
    group("audit", "审计", [
      row({ kind: "audit" }, "操作记录"),
      row({ kind: "audit-retention" }, "保留策略"),
    ]),
  ];
  return (
    <Tree
      aria-label="设置目录"
      nodes={nodes}
      expandedIds={expanded}
      onExpandedChange={setExpanded}
      selectedId={settingsTargetKey(target)}
      onSelect={() => {}}
      onOpen={(id, intent) => {
        const item = targets.get(id);
        if (item) onSelect(item, intent);
      }}
    />
  );
}
