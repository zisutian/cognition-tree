import type { ReactNode } from "react";

export type ActivityId =
  | "notes"
  | "journal"
  | "todo"
  | "syntax"
  | "search"
  | "repository"
  | "settings";

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
