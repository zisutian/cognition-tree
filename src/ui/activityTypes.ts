import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type ActivityId =
  | "notes"
  | "migration"
  | "visualization"
  | "syntax"
  | "search"
  | "data"
  | "settings";

export type ActivityItem = {
  icon: LucideIcon;
  id: ActivityId;
  label: string;
};

export type ActivitySlots = {
  detail: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
};
