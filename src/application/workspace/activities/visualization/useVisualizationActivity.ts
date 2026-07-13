import { useMemo } from "react";
import {
  findWorkspaceNote,
  getWorkspaceNoteReferenceGraph,
} from "../../../../workspace/queries/workspaceQueries";
import { createUiReferenceGraphView } from "../../projection/viewGraph";
import type { WorkspaceRuntime } from "../../runtime/useWorkspaceApplication";
import { useWorkspaceParseIndex } from "../../runtime/useWorkspaceParseIndex";
import type { WorkspaceSelection } from "../../selection/useWorkspaceSelection";
import type {
  VisualizationFilterController,
  VisualizationViewModel,
} from "./visualizationViewModel";

const emptyReferenceGraphView = createUiReferenceGraphView({
  edges: [],
  nodes: [],
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
  const index = useWorkspaceParseIndex(
    runtime.parseIndexCache,
    runtime.effectiveContext,
  );
  const graph = useMemo(
    () => index
      ? createUiReferenceGraphView(getWorkspaceNoteReferenceGraph(index))
      : emptyReferenceGraphView,
    [index],
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
