import { useState } from "react";
import { useNotesActivity } from "../bindings/workspace/activities/notes/useNotesActivity";
import {
  createNotesActivitySlots,
  createNotesWorkspaceActivitySlots,
  type NotesMode,
} from "../views/notes/NotesActivitySlots";
import { useStructureOperationActivity } from "../bindings/workspace/activities/structure-operation/useStructureOperationActivity";
import { useStructureOperationState } from "../bindings/workspace/activities/structure-operation/useStructureOperationState";
import { createStructureOperationActivitySlots } from "../views/structure-operation/StructureOperationActivitySlots";
import { useVisualizationActivity } from "../bindings/workspace/activities/visualization/useVisualizationActivity";
import { useVisualizationFilter } from "../bindings/workspace/activities/visualization/useVisualizationFilter";
import { createVisualizationActivitySlots } from "../views/visualization/VisualizationActivitySlots";
import type { WorkspaceApplication } from "../bindings/workspace/runtime/useWorkspaceApplication";
import type { ActivityControllerProps } from "./activityController";
import { renderWorkspaceUnavailableActivity } from "./WorkspaceUnavailableActivityController";

function ActiveNotesActivity({
  application,
  mode,
  onModeChange,
  repositoryName,
  renderActivity,
}: {
  application: WorkspaceApplication;
  mode: NotesMode;
  onModeChange(mode: NotesMode): void;
  repositoryName: string;
  renderActivity: ActivityControllerProps["renderActivity"];
}) {
  const view = useNotesActivity({
    navigation: application.navigation,
    runtime: application.runtime,
    selection: application.selection,
  });
  const structureState = useStructureOperationState({
    activeNoteId: application.selection.activeNoteId,
    notes: application.runtime.effectiveNotes,
    workspace: application.runtime.effectiveWorkspace,
  });
  const structure = useStructureOperationActivity({
    runtime: application.runtime,
    selection: application.selection,
    state: structureState,
  });
  const visualizationFilter = useVisualizationFilter();
  const visualization = useVisualizationActivity({
    filter: visualizationFilter,
    runtime: application.runtime,
    selection: application.selection,
  });

  return renderActivity((controls) =>
    createNotesWorkspaceActivitySlots({
      edit: createNotesActivitySlots({
        focusMode: controls.focusMode,
        onCollapseDetail: controls.onCollapseDetail,
        onToggleFocusMode: controls.onToggleFocusMode,
        repositoryName,
        view,
      }),
      graph: createVisualizationActivitySlots({
        onCollapseDetail: controls.onCollapseDetail,
        onConfigureSyntax: controls.onConfigureSyntax,
        shell: application.shell,
        view: visualization,
      }),
      mode,
      onModeChange,
      structure: createStructureOperationActivitySlots({
        onConfigureSyntax: controls.onConfigureSyntax,
        shell: application.shell,
        view: structure,
      }),
    })
  );
}

export function NotesActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: ActivityControllerProps) {
  const repositoryId = application.repository.activeDescriptor?.id ??
    "workspace-unavailable";
  const [modeByRepository, setModeByRepository] = useState<
    Record<string, NotesMode>
  >({});
  const mode = modeByRepository[repositoryId] ?? "edit";
  const setMode = (nextMode: NotesMode) => {
    setModeByRepository((current) =>
      current[repositoryId] === nextMode
        ? current
        : { ...current, [repositoryId]: nextMode }
    );
  };

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
      mode={mode}
      onModeChange={setMode}
      repositoryName={application.repository.activeDescriptor?.label ??
        (application.repository.session.status === "absent"
          ? "笔记"
          : application.repository.session.storageLabel)}
      renderActivity={renderActivity}
    />
  );
}
