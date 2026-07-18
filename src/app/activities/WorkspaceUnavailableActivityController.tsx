import type { WorkbenchWorkspaceState } from "../../application/workbench/workbenchApplication";
import { WorkspaceUnavailablePanel } from "../../ui/activities/WorkspaceUnavailablePanel";
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
