import {
  Braces,
  Database,
  FileText,
  ListTree,
  MoveRight,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type SidebarActivityId =
  | "notes"
  | "search"
  | "outline"
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
  { id: "search", label: "搜索", icon: Search },
  { id: "outline", label: "结构", icon: ListTree },
  { id: "syntax", label: "语法", icon: Braces },
  { id: "migration", label: "迁移", icon: MoveRight },
  { id: "data", label: "数据", icon: Database },
  { id: "settings", label: "设置", icon: Settings },
];

export const sidebarPlaceholderEntries: Record<
  Exclude<SidebarActivityId, "notes" | "outline" | "syntax" | "migration">,
  string[]
> = {
  search: ["标题", "正文", "块类型"],
  data: ["文件库", "索引", "导入导出"],
  settings: ["外观", "快捷键", "许可证"],
};
