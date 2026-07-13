import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { ActivityId } from "../../ui/activityTypes";
import { useWorkbenchLayout } from "../../ui/useWorkbenchLayout";
import { NotesActivityController } from "./NotesActivityController";
import { PlaceholderActivityController } from "./PlaceholderActivityController";
import { SettingsActivityController } from "./SettingsActivityController";
import { StructureOperationActivityController } from "./StructureOperationActivityController";
import { SyntaxActivityController } from "./SyntaxActivityController";
import { VisualizationActivityController } from "./VisualizationActivityController";

export function WorkspaceActivities({
  activeActivityId,
  application,
  onActiveActivityChange,
}: {
  activeActivityId: ActivityId;
  application: WorkspaceApplication;
  onActiveActivityChange: (activityId: ActivityId) => void;
}) {
  const workbench = useWorkbenchLayout();
  const controllerProps = {
    application,
    onActiveActivityChange,
    workbench,
  };

  return (
    <>
      <NotesActivityController
        {...controllerProps}
        active={activeActivityId === "notes"}
      />
      <StructureOperationActivityController
        {...controllerProps}
        active={activeActivityId === "structure-operation"}
      />
      <VisualizationActivityController
        {...controllerProps}
        active={activeActivityId === "visualization"}
      />
      <SyntaxActivityController
        {...controllerProps}
        active={activeActivityId === "syntax"}
      />
      <SettingsActivityController
        {...controllerProps}
        active={activeActivityId === "settings"}
      />
      {activeActivityId === "search" || activeActivityId === "data" ? (
        <PlaceholderActivityController
          activityId={activeActivityId}
          onActiveActivityChange={onActiveActivityChange}
          workbench={workbench}
        />
      ) : null}
    </>
  );
}
