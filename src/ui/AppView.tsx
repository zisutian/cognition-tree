import type { ViewModel } from "../application/workspace/view-model/activityViewModels";
import type { ActivityId } from "./activityTypes";
import { createActivitySlots } from "./activities/activityRegistry";
import { AppFrame } from "./AppFrame";
import { useWorkbenchLayout } from "./useWorkbenchLayout";
import "./styles/index.css";

type AppViewProps = {
  activeActivityId: ActivityId;
  view: ViewModel;
  onActiveActivityChange: (activityId: ActivityId) => void;
};

function AppView({
  activeActivityId,
  view,
  onActiveActivityChange,
}: AppViewProps) {
  const workbench = useWorkbenchLayout();

  const configureSyntax = () => {
    onActiveActivityChange("syntax");
    workbench.expandPanels();
  };
  const activitySlots = createActivitySlots({
    activityId: activeActivityId,
    onCollapseDetail: workbench.collapseDetail,
    onConfigureSyntax: configureSyntax,
    view,
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
