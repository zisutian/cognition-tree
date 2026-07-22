import { useStructureOperationActivity } from "../bindings/workspace/activities/structure-operation/useStructureOperationActivity";
import { useStructureOperationState } from "../bindings/workspace/activities/structure-operation/useStructureOperationState";
import { createStructureOperationActivitySlots } from "../views/structure-operation/StructureOperationActivitySlots";
import type { WorkspaceApplication } from "../bindings/workspace/runtime/useWorkspaceApplication";
import type { ActivityControllerProps } from "./activityController";
import { renderWorkspaceUnavailableActivity } from "./WorkspaceUnavailableActivityController";

function ActiveStructureOperationActivity({
  application,
  renderActivity,
  state,
}: {
  application: WorkspaceApplication;
  renderActivity: ActivityControllerProps["renderActivity"];
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
  active,
  application,
  renderActivity,
}: {
  active: boolean;
  application: WorkspaceApplication;
  renderActivity: ActivityControllerProps["renderActivity"];
}) {
  const state = useStructureOperationState({
    activeNoteId: application.selection.activeNoteId,
    notes: application.runtime.effectiveNotes,
    workspace: application.runtime.effectiveWorkspace,
  });

  if (!active) {
    return null;
  }

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
}: ActivityControllerProps) {
  if (application.workspace.status !== "ready") {
    if (!active) {
      return null;
    }

    return renderWorkspaceUnavailableActivity({
      onOpenRepository: () => onActiveActivityChange("repository"),
      renderActivity,
      workspace: application.workspace,
    });
  }

  return (
    <ReadyStructureOperationActivity
      active={active}
      application={application.workspace.application}
      renderActivity={renderActivity}
    />
  );
}
