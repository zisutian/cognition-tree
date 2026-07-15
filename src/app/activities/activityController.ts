import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { CreateActivitySlots } from "../../ui/activityTypes";
import type { ReactNode } from "react";

export type RenderWorkspaceActivity = (
  createActivitySlots: CreateActivitySlots,
) => ReactNode;

export type WorkspaceActivityControllerProps = {
  active: boolean;
  application: WorkspaceApplication;
  renderActivity: RenderWorkspaceActivity;
};
