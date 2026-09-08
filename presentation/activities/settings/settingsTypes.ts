// SPDX-License-Identifier: GPL-3.0-or-later

export type SettingsTarget =
  | {
      kind:
        | "interface"
        | "network"
        | "paths"
        | "owner"
        | "migration"
        | "agent-default"
        | "agent-discovery"
        | "audit-retention"
        | "local-api";
    }
  | {
      [Kind in "provider" | "profile"]: {
        kind: Kind;
        id: string | null;
      };
    }["provider" | "profile"]
  | { kind: "audit" };

export function settingsTargetKey(target: SettingsTarget) {
  return "id" in target ? `${target.kind}:${target.id ?? "new"}` : target.kind;
}

export const settingsPageLabels = {
  interface: "工作台布局",
  network: "网络访问",
  paths: "路径显示",
  owner: "所有者凭据",
  migration: "数据迁移",
  "agent-default": "默认会话配置",
  "agent-discovery": "本地服务发现",
  provider: "Provider",
  profile: "Profile",
  "local-api": "本机 API",
  audit: "操作记录",
  "audit-retention": "保留策略",
} as const;
