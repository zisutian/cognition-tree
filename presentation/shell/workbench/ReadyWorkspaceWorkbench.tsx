import type { ActivityInteractionState } from "../../ui/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "react";
import type { JournalApplication } from "../../../application/journal/index.ts";
import type { RepositoryApplication } from "../../../application/repository/index.ts";
import type { TodoApplication } from "../../../application/todo/index.ts";
import type { ApiAccessApplication } from "../../../application/apiAccess/index.ts";
import type { AgentApplication } from "../../../application/agent/index.ts";
import type { SystemApplication } from "../../../application/system/index.ts";
import type { OperationApplication } from "../../../application/operations/index.ts";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../application/workbench/index.ts";
import type { ProblemCenterController } from "../../../application/problems/index.ts";
import type { ActiveWorkspaceSession } from "../../../application/workspace/index.ts";
import type { WorkbenchApplication } from "../application/workbenchApplication.ts";
import { useWorkspaceApplication } from "../../workspace/index.ts";
import type { ActivityId } from "../../ui/index.ts";
import { WorkspaceWorkbench } from "./WorkspaceWorkbench.tsx";

export function ReadyWorkspaceWorkbench({
  scheduler,
  activeActivityId,
  interaction,
  onInteractionStateChange,
  agent,
  apiAccess,
  controller,
  feedbackController,
  journal,
  operations,
  onActiveActivityChange,
  repository,
  search,
  session,
  snapshot,
  system,
  todo,
}: {
  scheduler: import("../../../application/runtime/index.ts").ApplicationScheduler;
  activeActivityId: ActivityId;
  interaction: ActivityInteractionState;
  onInteractionStateChange(
    activityId: ActivityId,
    state: ActivityInteractionState,
  ): void;
  agent: AgentApplication;
  apiAccess: ApiAccessApplication;
  controller: WorkbenchController;
  feedbackController: ProblemCenterController<ActivityId>;
  journal: JournalApplication;
  operations: OperationApplication;
  onActiveActivityChange: (
    activityId: ActivityId,
    beforeChange?: () => boolean | void,
  ) => void;
  repository: RepositoryApplication;
  search: WorkbenchApplication["search"];
  session: ActiveWorkspaceSession;
  snapshot: WorkbenchControllerSnapshot;
  system: SystemApplication;
  todo: TodoApplication;
}) {
  const workspace = useWorkspaceApplication(session, scheduler);
  const focusRequest =
    snapshot.navigation.status === "ready" ? snapshot.navigation : null;

  useEffect(() => {
    if (!focusRequest) return;
    onActiveActivityChange("notes", () => {
      const found = workspace.navigation.openNoteBlock(
        focusRequest.destination.resourceId,
        focusRequest.destination.blockId,
      );

      if (!found) {
        feedbackController.reportInfo(
          "notes",
          "搜索结果中的块已不存在，已打开笔记首行。",
        );
      }
    });
    controller.consumeWorkspaceNoteDestination(focusRequest.requestId);
  }, [
    controller,
    feedbackController,
    focusRequest,
    onActiveActivityChange,
    workspace.navigation,
  ]);

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      interaction={interaction}
      onInteractionStateChange={onInteractionStateChange}
      feedbackController={feedbackController}
      application={{
        agent,
        apiAccess,
        journal,
        operations,
        repository,
        search,
        system,
        todo,
        workspace: { application: workspace, status: "ready" },
      }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}
