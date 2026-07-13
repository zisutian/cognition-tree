import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { ActivityId } from "../../ui/activityTypes";
import type { WorkbenchController } from "../../ui/useWorkbenchLayout";

export type WorkspaceActivityControllerProps = {
  active: boolean;
  application: WorkspaceApplication;
  onActiveActivityChange: (activityId: ActivityId) => void;
  workbench: WorkbenchController;
};
