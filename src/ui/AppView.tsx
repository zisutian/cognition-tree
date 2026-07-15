import type { ActivityId, ActivitySlots } from "./activityTypes";
import { AppFrame } from "./AppFrame";
import { useWorkbenchFocusShortcuts } from "./useWorkbenchFocusShortcuts";
import type { WorkbenchController } from "./useWorkbenchLayout";
import "./styles/index.css";

type AppViewProps = {
  activeActivityId: ActivityId;
  createActivitySlots: (controls: {
    focusMode: boolean;
    onCollapseDetail: () => void;
    onConfigureSyntax: () => void;
    onToggleFocusMode: () => void;
  }) => ActivitySlots;
  onActiveActivityChange: (activityId: ActivityId) => void;
  workbench: WorkbenchController;
};

function AppView({
  activeActivityId,
  createActivitySlots,
  onActiveActivityChange,
  workbench,
}: AppViewProps) {
  const configureSyntax = () => {
    onActiveActivityChange("syntax");
    workbench.expandPanels();
  };
  const activitySlots = createActivitySlots({
    focusMode: workbench.layout.focusMode,
    onCollapseDetail: workbench.collapseDetail,
    onConfigureSyntax: configureSyntax,
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
    />
  );
}

export default AppView;
