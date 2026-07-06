import { useState } from "react";
import type { ViewModel } from "../application/workspace/view-model/useViewModel";
import type { ActivityId } from "./activityTypes";
import {
  createActivitySlots,
  activityItems,
} from "./activities/activityRegistry";
import { AppFrame } from "./AppFrame";
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleActivityChange = (activityId: ActivityId) => {
    if (activityId === activeActivityId) {
      setSidebarCollapsed((current) => !current);
      return;
    }

    onActiveActivityChange(activityId);
    setSidebarCollapsed(false);
  };
  const configureSyntax = () => {
    onActiveActivityChange("syntax");
    setSidebarCollapsed(false);
  };
  const activitySlots = createActivitySlots({
    activityId: activeActivityId,
    onConfigureSyntax: configureSyntax,
    view,
  });

  return (
    <AppFrame
      activeActivityId={activeActivityId}
      activityItems={activityItems}
      detailSlot={activitySlots.detail}
      mainSlot={activitySlots.main}
      sidebarCollapsed={sidebarCollapsed}
      sidebarSlot={activitySlots.sidebar}
      onActivityChange={handleActivityChange}
    />
  );
}

export default AppView;
