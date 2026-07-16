import { useMemo, useState } from "react";
import type { VisualizationViewModel } from "../../../application/workspace/activities/visualization/visualizationViewModel";
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../shared/primitives";
import { ReferenceGraphCanvas } from "./ReferenceGraphCanvas";
import { getEmptyGraphMessage } from "./graphEmptyState";
import {
  createVisibleReferenceGraph,
} from "./referenceGraphView";
import { VisualizationToolbar } from "./VisualizationToolbar";

export function VisualizationPanel({
  view,
}: {
  view: VisualizationViewModel;
}) {
  const [resetSignal, setResetSignal] = useState(0);
  const visualization = view;
  const { hideIsolated, localDepth, mode, query } = visualization.filter;
  const visibleGraph = useMemo(
    () =>
      createVisibleReferenceGraph(visualization.graph, {
        activeNoteId: visualization.activeNoteId,
        hideIsolated,
        localDepth,
        mode,
        query,
      }),
    [
      hideIsolated,
      localDepth,
      mode,
      query,
      visualization.activeNoteId,
      visualization.graph,
    ],
  );
  const topologyRevision = `${visualization.graph.revision}:${
    mode === "local" ? visualization.activeNoteId ?? "none" : "global"
  }:${mode}:${localDepth}:${
    hideIsolated ? 1 : 0
  }:${query}`;
  const emptyMessage = getEmptyGraphMessage({
    graphNodeCount: visualization.graph.nodes.length,
    hasActiveNote: Boolean(visualization.activeNoteId),
    hideIsolated,
    mode,
    query,
  });

  return (
    <Panel className="visualization-panel" aria-label="引用图谱">
      <PanelHeader title="引用图谱" />
      <PanelBody className="graph-body">
        <VisualizationToolbar
          hideIsolated={hideIsolated}
          localDepth={localDepth}
          mode={mode}
          query={query}
          onHideIsolatedChange={visualization.setHideIsolated}
          onLocalDepthChange={visualization.setLocalDepth}
          onModeChange={visualization.setMode}
          onQueryChange={visualization.setQuery}
          onReset={() => setResetSignal((current) => current + 1)}
        />
        <div className="graph-canvas">
          {visibleGraph.nodes.length > 0 ? (
            <ReferenceGraphCanvas
              graph={visibleGraph}
              resetSignal={resetSignal}
              selectedNoteId={visualization.activeNoteId}
              topologyRevision={topologyRevision}
              onSelectNote={visualization.onSelectNote}
            />
          ) : (
            <EmptyState
              description={emptyMessage.description}
              title={emptyMessage.title}
            />
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}
