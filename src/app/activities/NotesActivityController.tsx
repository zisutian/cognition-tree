import { useNotesActivity } from "../../application/workspace/activities/notes/useNotesActivity";
import { createNotesActivitySlots } from "../../ui/activities/notes/NotesActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

function ActiveNotesActivity({
  application,
  renderActivity,
}: Omit<WorkspaceActivityControllerProps, "active">) {
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
  ...props
}: WorkspaceActivityControllerProps) {
  return active ? <ActiveNotesActivity {...props} /> : null;
}
