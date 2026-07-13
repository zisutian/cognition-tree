import type { ActivityId, ActivitySlots } from "./activityTypes";
import { AppFrame } from "./AppFrame";
import type { WorkbenchController } from "./useWorkbenchLayout";
import "./styles/index.css";

type AppViewProps = {
  activeActivityId: ActivityId;
  createActivitySlots: (controls: {
    onCollapseDetail: () => void;
    onConfigureSyntax: () => void;
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
    onCollapseDetail: workbench.collapseDetail,
    onConfigureSyntax: configureSyntax,
  });
  const hasContext = activitySlots.context !== null;

  const handleActivityChange = (activityId: ActivityId) => {
    if (activityId === activeActivityId) {
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
