import { useEffect } from "react";
import type { JournalApplication } from "../../../application/journal";
import type { RepositoryApplication } from "../../../application/repository/repositoryApplication";
import type { TodoApplication } from "../../../application/todo";
import type { ApiAccessApplication } from "../../../application/apiAccess/apiAccessAdministration";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../application/workbench/workbenchController";
import type { WorkbenchFeedbackController } from "../../../application/workbench/workbenchFeedbackController";
import type { ActiveWorkspaceSession } from "../../../application/workspace/session/workspaceSessionApplication";
import type { WorkbenchApplication } from "../../activities/workbenchApplication";
import { useWorkspaceApplication } from "../../activities/bindings/workspace/runtime/useWorkspaceApplication";
import type { ActivityId } from "../../ui/activityTypes";
import { WorkspaceWorkbench } from "./WorkspaceWorkbench";

export function ReadyWorkspaceWorkbench({
  activeActivityId,
  apiAccess,
  controller,
  feedbackController,
  journal,
  onActiveActivityChange,
  repository,
  search,
  session,
  snapshot,
  todo,
}: {
  activeActivityId: ActivityId;
  apiAccess: ApiAccessApplication;
  controller: WorkbenchController;
  feedbackController: WorkbenchFeedbackController<ActivityId>;
  journal: JournalApplication;
  onActiveActivityChange: (activityId: ActivityId) => void;
  repository: RepositoryApplication;
  search: WorkbenchApplication["search"];
  session: ActiveWorkspaceSession;
  snapshot: WorkbenchControllerSnapshot;
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
        apiAccess,
        journal,
        repository,
        search,
        todo,
        workspace: { application: workspace, status: "ready" },
      }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}
