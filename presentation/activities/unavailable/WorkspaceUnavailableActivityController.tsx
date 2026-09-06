// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkbenchWorkspaceState } from "../../workspace/workspaceApplicationState";
import { WorkspaceUnavailablePanel } from "./WorkspaceUnavailablePanel";
import type { RenderActivity } from "../../ui/activityController";

export function renderWorkspaceUnavailableActivity({
  onOpenRepository,
  renderActivity,
  workspace,
}: {
  onOpenRepository: () => void;
  renderActivity: RenderActivity;
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
