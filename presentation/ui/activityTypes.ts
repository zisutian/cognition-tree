// SPDX-License-Identifier: GPL-3.0-or-later

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PageLayout } from "./shared/PageLayout.ts";

import type { ActivityId } from "../navigation/index.ts";
export type {
  ActivityId,
  ActivityInteractionState,
} from "../navigation/index.ts";

export type ActivityRegionSlot = {
  layout?: PageLayout;
  toolbar?: ReactNode;
  footer?: ReactNode;
  fixedPageActions?: boolean;
  collapseLabel?: string;
  actions?: ReactNode;
  content: ReactNode;
  title: string;
};

export type ActivityContextSlot = ActivityRegionSlot;

export type ActivitySlots = {
  context: ActivityContextSlot | null;
  /** No detail content still leaves the shared workbench region in place. */
  detail: ActivityRegionSlot | null;
  main: ActivityRegionSlot;
};

export type ActivitySlotControls = {
  contextWidth: number;
  focusMode: boolean;
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
