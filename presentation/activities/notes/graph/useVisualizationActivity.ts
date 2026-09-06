import { useMemo } from "react";
import { findWorkspaceNote } from "../../../../core/workspace/index.ts";
import { createUiReferenceGraphView } from "../../../../application/workspace/index.ts";
import type {
  WorkspaceRuntime,
  WorkspaceSelection,
} from "../../../workspace/index.ts";

import type {
  VisualizationFilterController,
  VisualizationViewModel,
} from "../../../../application/workspace/index.ts";

const emptyReferenceGraphView = createUiReferenceGraphView({
  ambiguousReferences: [],
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
