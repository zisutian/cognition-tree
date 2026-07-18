import type { WorkbenchApplication } from "../../application/workbench/workbenchApplication";
import type { CreateActivitySlots } from "../../ui/activityTypes";
import type { ReactNode } from "react";

export type RenderWorkspaceActivity = (
  createActivitySlots: CreateActivitySlots,
) => ReactNode;

export type WorkspaceActivityControllerProps = {
  active: boolean;
  application: WorkbenchApplication;
  onActiveActivityChange: (activityId: import("../../ui/activityTypes").ActivityId) => void;
  renderActivity: RenderWorkspaceActivity;
};
