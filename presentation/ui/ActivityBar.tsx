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
import type {
  ActivityId,
  ActivityItem,
} from "./activityTypes";

export const primaryActivityItems: ActivityItem[] = [
  { id: "notes", label: "笔记", icon: FileText },
  { id: "journal", label: "日记", icon: CalendarDays },
  { id: "todo", label: "代办", icon: ListChecks },
  { id: "structure-operation", label: "结构操作", icon: MoveRight },
  { id: "visualization", label: "引用图谱", icon: Network },
  { id: "syntax", label: "语法", icon: Braces },
  { id: "search", label: "搜索", icon: Search },
];

export const utilityActivityItems: ActivityItem[] = [
  { id: "data", label: "数据", icon: Database },
  { id: "repository", label: "仓库", icon: Archive },
  { id: "settings", label: "设置", icon: Settings },
];

export const activityItems: ActivityItem[] = [
  ...primaryActivityItems,
  ...utilityActivityItems,
];

export function ActivityBar({
  activeActivityId,
  onActivityChange,
}: {
  activeActivityId: ActivityId;
  onActivityChange: (activityId: ActivityId) => void;
}) {
  return (
    <nav className="activity-bar" aria-label="工作区功能">
      <div className="activity-group">
        {primaryActivityItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              aria-current={item.id === activeActivityId ? "page" : undefined}
              aria-label={item.label}
              className={item.id === activeActivityId ? "is-active" : ""}
              key={item.id}
              onClick={() => onActivityChange(item.id)}
              title={item.label}
              type="button"
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
            </button>
          );
        })}
      </div>
      <div className="activity-group activity-group-bottom">
        {utilityActivityItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              aria-current={item.id === activeActivityId ? "page" : undefined}
              aria-label={item.label}
              className={item.id === activeActivityId ? "is-active" : ""}
              key={item.id}
              onClick={() => onActivityChange(item.id)}
              title={item.label}
              type="button"
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
