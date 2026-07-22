import {
  Archive,
  Braces,
  CalendarDays,
  Database,
  FileText,
  ListChecks,
  MoveRight,
  Network,
  Search,
  Settings,
} from "lucide-react";
import type { ActivityId, ActivityItem } from "./activityTypes";

export const primaryActivityItems: readonly ActivityItem[] = [
  { id: "notes", label: "笔记", icon: FileText },
  { id: "journal", label: "日记", icon: CalendarDays },
  { id: "todo", label: "代办", icon: ListChecks },
  { id: "structure-operation", label: "结构操作", icon: MoveRight },
  { id: "visualization", label: "引用图谱", icon: Network },
  { id: "syntax", label: "语法", icon: Braces },
  { id: "search", label: "搜索", icon: Search },
];

export const utilityActivityItems: readonly ActivityItem[] = [
  { id: "data", label: "数据", icon: Database },
  { id: "repository", label: "仓库", icon: Archive },
  { id: "settings", label: "设置", icon: Settings },
];

export const activityItems: readonly ActivityItem[] = [
  ...primaryActivityItems,
  ...utilityActivityItems,
];

export function isActivityId(value: string): value is ActivityId {
  return activityItems.some(({ id }) => id === value);
}

export function getActivityLabel(activityId: ActivityId) {
  return activityItems.find(({ id }) => id === activityId)?.label ?? activityId;
}
