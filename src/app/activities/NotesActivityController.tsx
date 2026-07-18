import { useNotesActivity } from "../../application/workspace/activities/notes/useNotesActivity";
import { createNotesActivitySlots } from "../../ui/activities/notes/NotesActivitySlots";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { WorkspaceActivityControllerProps } from "./activityController";
import { renderWorkspaceUnavailableActivity } from "./WorkspaceUnavailableActivityController";

function ActiveNotesActivity({
  application,
  renderActivity,
}: {
  application: WorkspaceApplication;
  renderActivity: WorkspaceActivityControllerProps["renderActivity"];
}) {
  const view = useNotesActivity({
    errorMessage: application.shell.errorMessage,
    navigation: application.navigation,
    runtime: application.runtime,
    selection: application.selection,
  });

  return renderActivity((controls) =>
    createNotesActivitySlots({
      focusMode: controls.focusMode,
      onCollapseDetail: controls.onCollapseDetail,
      onToggleFocusMode: controls.onToggleFocusMode,
      view,
    }),
  );
}

export function NotesActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  if (!active) {
    return null;
  }
  if (application.workspace.status !== "ready") {
    return renderWorkspaceUnavailableActivity({
      onOpenRepository: () => onActiveActivityChange("repository"),
      renderActivity,
      workspace: application.workspace,
    });
  }

  return (
    <ActiveNotesActivity
      application={application.workspace.application}
      renderActivity={renderActivity}
    />
  );
}
