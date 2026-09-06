// SPDX-License-Identifier: GPL-3.0-or-later

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type ActivityId =
  | "agent"
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

export type ActivityNavigationItem = {
  group: "management" | "primary";
  icon: LucideIcon;
  id: ActivityId;
  label: string;
};

export type ActivityInteractionState = Readonly<{
  navigationBlocked: boolean;
  statusMessage: string;
}>;
