// SPDX-License-Identifier: GPL-3.0-or-later

import type { RenderActivity } from "../../ui/index.ts";
import type { WorkbenchWorkspaceState } from "../../workspace/index.ts";
import { WorkspaceUnavailablePanel } from "./WorkspaceUnavailablePanel.tsx";

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
    main: {
      title: "笔记",
      layout: "detail",
      content: (
        <WorkspaceUnavailablePanel
          onOpenRepository={onOpenRepository}
          workspace={workspace}
        />
      ),
    },
  }));
}

export function WorkspaceUnavailableActivityController(
  props: Parameters<typeof renderWorkspaceUnavailableActivity>[0],
) {
  return renderWorkspaceUnavailableActivity(props);
}
