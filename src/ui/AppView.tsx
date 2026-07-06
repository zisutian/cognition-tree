import { useState } from "react";
import type { ViewModel } from "../application/workspace/useViewModel";
import type { ActivityId } from "./activityTypes";
import {
  createActivitySlots,
  activityItems,
} from "./activities/activityRegistry";
import { AppFrame } from "./AppFrame";
import "./styles/index.css";

type AppViewProps = {
  view: ViewModel;
};

function AppView({ view }: AppViewProps) {
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleActivityChange = (activityId: ActivityId) => {
    if (activityId === activeActivityId) {
      setSidebarCollapsed((current) => !current);
      return;
    }

    setActiveActivityId(activityId);
    setSidebarCollapsed(false);
  };
  const configureSyntax = () => {
    setActiveActivityId("syntax");
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
