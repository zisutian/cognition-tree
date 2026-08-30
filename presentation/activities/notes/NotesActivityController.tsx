import { useNotesActivity } from "./edit/useNotesActivity";
import {
  createNotesActivitySlots,
  createNotesWorkspaceActivitySlots,
  type NotesMode,
} from "./edit/NotesActivitySlots";
import { useStructureOperationActivity } from "./structure/useStructureOperationActivity";
import { useStructureOperationState } from "./structure/useStructureOperationState";
import { createStructureOperationActivitySlots } from "./structure/StructureOperationActivitySlots";
import { useVisualizationActivity } from "./graph/useVisualizationActivity";
import { useVisualizationFilter } from "./graph/useVisualizationFilter";
import { createVisualizationActivitySlots } from "./graph/VisualizationActivitySlots";
import {
  useReferenceGraphSession,
  type ReferenceGraphSession,
} from "./graph/useReferenceGraphSession";
import type { WorkspaceApplication } from "../../workspace/runtime/useWorkspaceApplication";
import type { ActivityControllerProps } from "../activityController";
import { renderWorkspaceUnavailableActivity } from "../unavailable/WorkspaceUnavailableActivityController";
import {
  useRepositorySessionState,
} from "../../ui/workbench/useRepositorySessionState";
import {
  createRepositorySessionKey,
} from "../../ui/workbench/repositorySessionStore";

const notesModeSessionKey = createRepositorySessionKey<NotesMode>(
  "notes-mode",
);

function ActiveNotesActivity({
  application,
  mode,
  onModeChange,
  repositoryId,
  repositoryName,
  renderActivity,
  visualizationSession,
}: {
  application: WorkspaceApplication;
  mode: NotesMode;
  onModeChange(mode: NotesMode): void;
  repositoryId: string;
  repositoryName: string;
  renderActivity: ActivityControllerProps["renderActivity"];
  visualizationSession: ReferenceGraphSession;
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
  const visualizationFilter = useVisualizationFilter(repositoryId);
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
        onReload: application.reload,
        onToggleFocusMode: controls.onToggleFocusMode,
        repositoryName,
        view,
      }),
      graph: createVisualizationActivitySlots({
        onCollapseDetail: controls.onCollapseDetail,
        onConfigureSyntax: controls.onConfigureSyntax,
        session: visualizationSession,
        shell: application.shell,
        view: visualization,
      }),
      mode,
      onModeChange,
      repositoryName,
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
  const [mode, setMode] = useRepositorySessionState<NotesMode>(
    notesModeSessionKey,
    repositoryId,
    () => "edit",
  );
  const visualizationSession = useReferenceGraphSession(repositoryId);

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
      repositoryId={repositoryId}
      repositoryName={application.repository.activeDescriptor?.label ??
        (application.repository.session.status === "absent"
          ? "笔记"
          : application.repository.session.storageLabel)}
      renderActivity={renderActivity}
      visualizationSession={visualizationSession}
    />
  );
}
