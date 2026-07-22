import { useNotesActivity } from "../../shell/bindings/application/workspace/activities/notes/useNotesActivity";
import { createNotesActivitySlots } from "../views/notes/NotesActivitySlots";
import type { WorkspaceApplication } from "../../shell/bindings/application/workspace/runtime/useWorkspaceApplication";
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
