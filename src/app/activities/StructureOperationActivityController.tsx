import { useStructureOperationActivity } from "../../application/workspace/activities/structure-operation/useStructureOperationActivity";
import { useStructureOperationState } from "../../application/workspace/activities/structure-operation/useStructureOperationState";
import { createStructureOperationActivitySlots } from "../../ui/activities/structure-operation/StructureOperationActivitySlots";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { WorkspaceActivityControllerProps } from "./activityController";
import { renderWorkspaceUnavailableActivity } from "./WorkspaceUnavailableActivityController";

function ActiveStructureOperationActivity({
  application,
  renderActivity,
  state,
}: {
  application: WorkspaceApplication;
  renderActivity: WorkspaceActivityControllerProps["renderActivity"];
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

function ReadyStructureOperationActivity({
  application,
  renderActivity,
}: {
  application: WorkspaceApplication;
  renderActivity: WorkspaceActivityControllerProps["renderActivity"];
}) {
  const state = useStructureOperationState({
    activeNoteId: application.selection.activeNoteId,
    notes: application.runtime.effectiveNotes,
    workspace: application.runtime.effectiveWorkspace,
  });

  return (
    <ActiveStructureOperationActivity
      application={application}
      renderActivity={renderActivity}
      state={state}
    />
  );
}

export function StructureOperationActivityController({
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
    <ReadyStructureOperationActivity
      application={application.workspace.application}
      renderActivity={renderActivity}
    />
  );
}
