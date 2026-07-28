import { useNotesActivity } from "../bindings/workspace/activities/notes/useNotesActivity";
import { createNotesActivitySlots } from "../views/notes/NotesActivitySlots";
import type { WorkspaceApplication } from "../bindings/workspace/runtime/useWorkspaceApplication";
import type { ActivityControllerProps } from "./activityController";
import { renderWorkspaceUnavailableActivity } from "./WorkspaceUnavailableActivityController";

function ActiveNotesActivity({
  application,
  repositoryName,
  renderActivity,
}: {
  application: WorkspaceApplication;
  repositoryName: string;
  renderActivity: ActivityControllerProps["renderActivity"];
}) {
  const view = useNotesActivity({
    navigation: application.navigation,
    runtime: application.runtime,
    selection: application.selection,
  });

  return renderActivity((controls) =>
    createNotesActivitySlots({
      focusMode: controls.focusMode,
      onCollapseDetail: controls.onCollapseDetail,
      onToggleFocusMode: controls.onToggleFocusMode,
      repositoryName,
      view,
    }),
  );
}

export function NotesActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: ActivityControllerProps) {
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
      repositoryName={application.repository.activeDescriptor?.label ??
        (application.repository.session.status === "absent"
          ? "笔记"
          : application.repository.session.storageLabel)}
      renderActivity={renderActivity}
    />
  );
}
