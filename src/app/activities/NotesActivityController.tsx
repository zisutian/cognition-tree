import { useState } from "react";
import type { EditorFocusRequest } from "../../application/workspace/activities/notes/notesViewModel";
import { useNotesActivity } from "../../application/workspace/activities/notes/useNotesActivity";
import AppView from "../../ui/AppView";
import { createNotesActivitySlots } from "../../ui/activities/notes/NotesActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

function ActiveNotesActivity({
  application,
  focusRequest,
  onActiveActivityChange,
  onFocusLine,
  workbench,
}: Omit<WorkspaceActivityControllerProps, "active"> & {
  focusRequest: EditorFocusRequest | null;
  onFocusLine: (lineNumber: number) => void;
}) {
  const view = useNotesActivity({
    errorMessage: application.shell.errorMessage,
    focusTarget: focusRequest,
    onFocusLine,
    runtime: application.runtime,
    selection: application.selection,
  });

  return (
    <AppView
      activeActivityId="notes"
      createActivitySlots={(controls) => createNotesActivitySlots({
        focusMode: controls.focusMode,
        onCollapseDetail: controls.onCollapseDetail,
        onToggleFocusMode: controls.onToggleFocusMode,
        view,
      })}
      onActiveActivityChange={onActiveActivityChange}
      workbench={workbench}
    />
  );
}

export function NotesActivityController({
  active,
  ...props
}: WorkspaceActivityControllerProps) {
  const [focusRequest, setFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const focusLine = (lineNumber: number) => {
    setFocusRequest((current) => ({
      lineNumber,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };

  return active ? (
    <ActiveNotesActivity
      {...props}
      focusRequest={focusRequest}
      onFocusLine={focusLine}
    />
  ) : null;
}
