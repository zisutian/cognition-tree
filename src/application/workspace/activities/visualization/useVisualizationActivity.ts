import { useMemo } from "react";
import { findWorkspaceNote } from "../../../../../core/workspace/queries/workspaceQueries";
import { createUiReferenceGraphView } from "../../projection/viewGraph";
import type { WorkspaceRuntime } from "../../runtime/useWorkspaceApplication";
import type { WorkspaceSelection } from "../../selection/useWorkspaceSelection";
import type {
  VisualizationFilterController,
  VisualizationViewModel,
} from "./visualizationViewModel";

const emptyReferenceGraphView = createUiReferenceGraphView({
  ambiguousReferences: [],
  edges: [],
  nodes: [],
  revision: 0,
  unresolvedReferences: [],
});

export function useVisualizationActivity({
  filter,
  runtime,
  selection,
}: {
  filter: VisualizationFilterController;
  runtime: WorkspaceRuntime;
  selection: WorkspaceSelection;
}): VisualizationViewModel {
  const graph = useMemo(
    () => runtime.analysis.index
      ? createUiReferenceGraphView(runtime.analysis.referenceGraph)
      : emptyReferenceGraphView,
    [runtime.analysis.index, runtime.analysis.referenceGraph],
  );
  const activeNote = selection.activeNoteId
    ? findWorkspaceNote(runtime.workspace, selection.activeNoteId)
    : null;

  return useMemo(
    () => ({
      activeNoteId: activeNote?.id ?? null,
      graph,
      onSelectNote: selection.selectNote,
      ...filter,
    }),
    [activeNote, filter, graph, selection.selectNote],
  );
}
