// SPDX-License-Identifier: GPL-3.0-or-later

/** Stable activity identity, navigation order and user-facing names. */
export const activityMetadata = [
  { id: "notes", label: "笔记", group: "primary" },
  { id: "journal", label: "日记", group: "primary" },
  { id: "todo", label: "代办", group: "primary" },
  { id: "syntax", label: "语法", group: "primary" },
  { id: "agent", label: "智能体", group: "management" },
  { id: "search", label: "搜索", group: "management" },
  { id: "repository", label: "仓库", group: "management" },
  { id: "settings", label: "设置", group: "management" },
] as const;

export type ActivityId = (typeof activityMetadata)[number]["id"];

export function isActivityId(value: string): value is ActivityId {
  return activityMetadata.some(({ id }) => id === value);
}

export function getActivityLabel(activityId: ActivityId): string {
  return activityMetadata.find(({ id }) => id === activityId)!.label;
}
