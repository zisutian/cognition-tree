import { useEffect } from "react";
import type { JournalApplication } from "../../../application/journal";
import type { RepositoryApplication } from "../../../application/repository/repositoryApplication";
import type { TodoApplication } from "../../../application/todo";
import type { ApiAccessApplication } from "../../../application/apiAccess/apiAccessAdministration";
import type { AgentApplication } from "../../../application/agent";
import type { SystemApplication } from "../../../application/system";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../application/workbench/workbenchController";
import type { WorkbenchFeedbackController } from "../../../application/workbench/workbenchFeedbackController";
import type { ActiveWorkspaceSession } from "../../../application/workspace/session/workspaceSessionApplication";
import type { WorkbenchApplication } from "../../activities/workbenchApplication";
import { useWorkspaceApplication } from "../../workspace/runtime/useWorkspaceApplication";
import type { ActivityId } from "../../ui/activityTypes";
import { WorkspaceWorkbench } from "./WorkspaceWorkbench";

export function ReadyWorkspaceWorkbench({
  activeActivityId,
  agent,
  apiAccess,
  controller,
  feedbackController,
  journal,
  onActiveActivityChange,
  repository,
  search,
  session,
  snapshot,
  system,
  todo,
}: {
  activeActivityId: ActivityId;
  agent: AgentApplication;
  apiAccess: ApiAccessApplication;
  controller: WorkbenchController;
  feedbackController: WorkbenchFeedbackController<ActivityId>;
  journal: JournalApplication;
  onActiveActivityChange: (activityId: ActivityId) => void;
  repository: RepositoryApplication;
  search: WorkbenchApplication["search"];
  session: ActiveWorkspaceSession;
  snapshot: WorkbenchControllerSnapshot;
  system: SystemApplication;
  todo: TodoApplication;
}) {
  const workspace = useWorkspaceApplication(session);
  const focusRequest = snapshot.navigation.status === "ready"
    ? snapshot.navigation
    : null;

  useEffect(() => {
    if (!focusRequest) return;
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
    onActiveActivityChange("notes");
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
      feedbackController={feedbackController}
      application={{
        agent,
        apiAccess,
        journal,
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
