import { useEffect } from "react";
import type { JournalApplication } from "../../../application/journal";
import type { RepositoryApplication } from "../../../application/repository/repositoryApplication";
import type { TodoApplication } from "../../../application/todo";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../application/workbench/workbenchController";
import type { WorkbenchFeedbackController } from "../../../application/workbench/workbenchFeedbackController";
import type { ActiveWorkspaceSession } from "../../../application/workspace/session/workspaceSessionApplication";
import { useWorkspaceApplication } from "../../activities/bindings/workspace/runtime/useWorkspaceApplication";
import type { ActivityId } from "../../ui/activityTypes";
import { WorkspaceWorkbench } from "./WorkspaceWorkbench";

export function ReadyWorkspaceWorkbench({
  activeActivityId,
  controller,
  feedbackController,
  journal,
  onActiveActivityChange,
  repository,
  session,
  snapshot,
  todo,
}: {
  activeActivityId: ActivityId;
  controller: WorkbenchController;
  feedbackController: WorkbenchFeedbackController<ActivityId>;
  journal: JournalApplication;
  onActiveActivityChange: (activityId: ActivityId) => void;
  repository: RepositoryApplication;
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
    workspace.navigation.openNoteLine(
      focusRequest.destination.noteId,
      focusRequest.destination.lineNumber,
    );
    onActiveActivityChange("notes");
    controller.consumeWorkspaceNoteDestination(focusRequest.requestId);
  }, [controller, focusRequest, onActiveActivityChange, workspace.navigation]);

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      feedbackController={feedbackController}
      application={{
        journal,
        repository,
        todo,
        workspace: { application: workspace, status: "ready" },
      }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}
