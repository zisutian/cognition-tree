import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type ActivityId =
  | "notes"
  | "structure-operation"
  | "visualization"
  | "syntax"
  | "search"
  | "data"
  | "repository"
  | "settings";

export type ActivityItem = {
  icon: LucideIcon;
  id: ActivityId;
  label: string;
};

export type ActivityContextSlot = {
  content: ReactNode;
  title: string;
};

export type ActivitySlots = {
  context: ActivityContextSlot | null;
  detail: ReactNode | null;
  main: ReactNode;
};

export type ActivitySlotControls = {
  contextWidth: number;
  focusMode: boolean;
  onCollapseDetail: () => void;
  onConfigureSyntax: () => void;
  onContextWidthChange: (width: number) => void;
  onToggleFocusMode: () => void;
};

export type CreateActivitySlots = (
  controls: ActivitySlotControls,
) => ActivitySlots;
