import type {
  ActivityId,
  CreateActivitySlots,
} from "./activityTypes";
import type { ReactNode } from "react";
import { AppFrame } from "./AppFrame";
import { useWorkbenchFocusShortcuts } from "./workbench/useWorkbenchFocusShortcuts";
import type { WorkbenchController } from "./workbench/useWorkbenchLayout";
import "./styles/index.css";

type AppViewProps = {
  activeActivityId: ActivityId;
  createActivitySlots: CreateActivitySlots;
  onActiveActivityChange: (activityId: ActivityId) => void;
  problemsSlot: ReactNode | null;
  workbench: WorkbenchController;
};

function AppView({
  activeActivityId,
  createActivitySlots,
  onActiveActivityChange,
  problemsSlot,
  workbench,
}: AppViewProps) {
  const configureSyntax = () => {
    onActiveActivityChange("syntax");
    workbench.expandPanels();
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

    onActiveActivityChange(activityId);
    workbench.expandPanels();
  };

  return (
    <AppFrame
      activeActivityId={activeActivityId}
      contextSlot={activitySlots.context}
      detailSlot={activitySlots.detail}
      layout={workbench.layout}
      mainSlot={activitySlots.main}
      onActivityChange={handleActivityChange}
      problemsSlot={problemsSlot}
    />
  );
}

export default AppView;
