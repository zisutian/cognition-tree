import { useStructureOperationActivity } from "../../application/workspace/activities/structure-operation/useStructureOperationActivity";
import { useStructureOperationState } from "../../application/workspace/activities/structure-operation/useStructureOperationState";
import { createStructureOperationActivitySlots } from "../../ui/activities/structure-operation/StructureOperationActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

function ActiveStructureOperationActivity({
  application,
  renderActivity,
  state,
}: Omit<WorkspaceActivityControllerProps, "active"> & {
  state: ReturnType<typeof useStructureOperationState>;
}) {
  const view = useStructureOperationActivity({
    runtime: application.runtime,
    selection: application.selection,
    state,
  });

  return renderActivity(({ onConfigureSyntax }) =>
    createStructureOperationActivitySlots({
      onConfigureSyntax,
      shell: application.shell,
      view,
    }),
  );
}

export function StructureOperationActivityController({
  active,
  application,
  ...props
}: WorkspaceActivityControllerProps) {
  const state = useStructureOperationState({
    activeNoteId: application.selection.activeNoteId,
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
