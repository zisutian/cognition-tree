// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ActivityNavigationItem,
  ActivityId,
  CreateActivitySlots,
} from "./activityTypes.ts";

import type { ReactNode } from "react";
import { AppFrame } from "./AppFrame.tsx";
import { useWorkbenchFocusShortcuts } from "./workbench/useWorkbenchFocusShortcuts.ts";
import type { WorkbenchController } from "./workbench/useWorkbenchLayout.ts";
import "./styles/index.css";

type AppViewProps = {
  activeActivityId: ActivityId;
  activityItems: readonly ActivityNavigationItem[];
  createActivitySlots: CreateActivitySlots;
  onActiveActivityChange: (
    activityId: ActivityId,
    beforeChange?: () => boolean | void,
  ) => void;
  problemsSlot: ReactNode;
  statusBarSlot: ReactNode;
  workbench: WorkbenchController;
};

function AppView({
  activeActivityId,
  activityItems,
  createActivitySlots,
  onActiveActivityChange,
  problemsSlot,
  statusBarSlot,
  workbench,
}: AppViewProps) {
  const configureSyntax = () => {
    onActiveActivityChange("syntax", workbench.expandPanels);
  };
  const activitySlots = createActivitySlots({
    contextWidth: workbench.layout.contextResizeValue,
    focusMode: workbench.layout.focusMode,
    onCollapseDetail: workbench.collapseDetail,
    onConfigureSyntax: configureSyntax,
    onContextWidthChange: workbench.setContextWidth,
    onToggleFocusMode: workbench.toggleFocusMode,
  });
  const hasContext = activitySlots.context !== null;

  useWorkbenchFocusShortcuts({
    enabled: activeActivityId === "notes",
    focusMode: workbench.layout.focusMode,
    onExitFocusMode: workbench.exitFocusMode,
    onToggleFocusMode: workbench.toggleFocusMode,
  });

  const handleActivityChange = (activityId: ActivityId) => {
    if (activityId === activeActivityId) {
      if (workbench.layout.focusMode) {
        workbench.exitFocusMode();
        return;
      }

      if (hasContext) {
        workbench.toggleContext();
      }
      return;
    }

    onActiveActivityChange(activityId, workbench.expandPanels);
  };

  return (
    <AppFrame
      activityItems={activityItems}
      activeActivityId={activeActivityId}
      contextSlot={activitySlots.context}
      detailSlot={activitySlots.detail}
      layout={workbench.layout}
      mainSlot={activitySlots.main}
      onActivityChange={handleActivityChange}
      problemsSlot={problemsSlot}
      statusBarSlot={statusBarSlot}
    />
  );
}

export default AppView;
