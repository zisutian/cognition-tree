import { useMemo } from "react";
import type { VisualizationViewModel } from "../../../../application/workspace/activities/visualization/visualizationViewModel";
import {
  EmptyState,
  Panel,
  PanelBody,
} from "../../../ui/shared/primitives";
import { ReferenceGraphCanvas } from "./ReferenceGraphCanvas";
import { getEmptyGraphMessage } from "./graphEmptyState";
import {
  createVisibleReferenceGraph,
} from "./referenceGraphView";
import type {
  ReferenceGraphSession,
} from "./useReferenceGraphSession";

export function VisualizationPanel({
  session,
  view,
}: {
  session: ReferenceGraphSession;
  view: VisualizationViewModel;
}) {
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
      <PanelBody className="graph-body">
        <div className="graph-canvas">
          {visibleGraph.nodes.length > 0 ? (
            <ReferenceGraphCanvas
              displaySettings={session.settings.display}
              forceSettings={session.settings.forces}
              graph={visibleGraph}
              resetSignal={session.resetSignal}
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
