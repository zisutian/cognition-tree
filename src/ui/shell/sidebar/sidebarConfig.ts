import {
  Braces,
  Database,
  FileText,
  MoveRight,
  Network,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type SidebarActivityId =
  | "notes"
  | "search"
  | "visualization"
  | "syntax"
  | "migration"
  | "data"
  | "settings";

export type SidebarActivityItem = {
  id: SidebarActivityId;
  label: string;
  icon: LucideIcon;
};

export const sidebarActivityItems: SidebarActivityItem[] = [
  { id: "notes", label: "笔记", icon: FileText },
  { id: "migration", label: "块迁移", icon: MoveRight },
  { id: "visualization", label: "可视化", icon: Network },
  { id: "syntax", label: "语法", icon: Braces },
  { id: "search", label: "搜索", icon: Search },
  { id: "data", label: "数据", icon: Database },
  { id: "settings", label: "设置", icon: Settings },
];

export const sidebarPlaceholderEntries: Record<
  Exclude<
    SidebarActivityId,
    "notes" | "visualization" | "syntax" | "migration" | "settings"
  >,
  string[]
> = {
  search: ["标题", "正文", "块类型"],
  data: ["文件库", "索引", "导入导出"],
};
