import { findWorkspaceNote } from "../../workspace/queries/workspaceQueries";
import { useStructureOperationActivity } from "../../application/workspace/activities/structure-operation/useStructureOperationActivity";
import { useStructureOperationState } from "../../application/workspace/activities/structure-operation/useStructureOperationState";
import AppView from "../../ui/AppView";
import { createStructureOperationActivitySlots } from "../../ui/activities/structure-operation/StructureOperationActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

function ActiveStructureOperationActivity({
  application,
  onActiveActivityChange,
  state,
  workbench,
}: Omit<WorkspaceActivityControllerProps, "active"> & {
  state: ReturnType<typeof useStructureOperationState>;
}) {
  const view = useStructureOperationActivity({
    runtime: application.runtime,
    selection: application.selection,
    state,
  });

  return (
    <AppView
      activeActivityId="structure-operation"
      createActivitySlots={({ onConfigureSyntax }) =>
        createStructureOperationActivitySlots({
          onConfigureSyntax,
          shell: application.shell,
          view,
        })
      }
      onActiveActivityChange={onActiveActivityChange}
      workbench={workbench}
    />
  );
}

export function StructureOperationActivityController({
  active,
  application,
  ...props
}: WorkspaceActivityControllerProps) {
  const activeNote =
    application.runtime.effectiveWorkspace &&
    application.selection.activeNoteId
      ? findWorkspaceNote(
          application.runtime.effectiveWorkspace,
          application.selection.activeNoteId,
        )
      : null;
  const state = useStructureOperationState({
    activeNote,
    notes: application.runtime.effectiveNotes,
    workspace: application.runtime.effectiveWorkspace,
  });

  return active ? (
    <ActiveStructureOperationActivity
      {...props}
      application={application}
      state={state}
    />
  ) : null;
}
