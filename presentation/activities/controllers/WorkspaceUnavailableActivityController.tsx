import type { WorkbenchWorkspaceState } from "../../shell/workbench/workbenchApplication";
import { WorkspaceUnavailablePanel } from "../views/WorkspaceUnavailablePanel";
import type { RenderWorkspaceActivity } from "./activityController";

export function renderWorkspaceUnavailableActivity({
  onOpenRepository,
  renderActivity,
  workspace,
}: {
  onOpenRepository: () => void;
  renderActivity: RenderWorkspaceActivity;
  workspace: Exclude<WorkbenchWorkspaceState, { status: "ready" }>;
}) {
  return renderActivity(() => ({
    context: null,
    detail: null,
    main: (
      <WorkspaceUnavailablePanel
        onOpenRepository={onOpenRepository}
        workspace={workspace}
      />
    ),
  }));
}

export function WorkspaceUnavailableActivityController(
  props: Parameters<typeof renderWorkspaceUnavailableActivity>[0],
) {
  return renderWorkspaceUnavailableActivity(props);
}
