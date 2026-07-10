import { useMemo, useState } from "react";
import type { UiVisualizationViewModel } from "../../../application/workspace/projection/viewGraph";
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
  type ReferenceGraphLocalDepth,
  type ReferenceGraphMode,
} from "./referenceGraphView";
import { VisualizationToolbar } from "./VisualizationToolbar";

export function VisualizationPanel({
  view,
}: {
  view: UiVisualizationViewModel;
}) {
  const [mode, setMode] = useState<ReferenceGraphMode>("global");
  const [localDepth, setLocalDepth] = useState<ReferenceGraphLocalDepth>(1);
  const [query, setQuery] = useState("");
  const [hideIsolated, setHideIsolated] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const visualization = view;
  const visibleGraph = useMemo(
    () =>
      createVisibleReferenceGraph(visualization.graph, {
        activeNoteId: visualization.activeNoteId,
        hideIsolated,
        localDepth,
        mode,
        query,
      }),
    [hideIsolated, localDepth, mode, query, visualization],
  );
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
          onHideIsolatedChange={setHideIsolated}
          onLocalDepthChange={setLocalDepth}
          onModeChange={setMode}
          onQueryChange={setQuery}
          onReset={() => setResetSignal((current) => current + 1)}
        />
        <div className="graph-canvas">
          {visibleGraph.nodes.length > 0 ? (
            <ReferenceGraphCanvas
              graph={visibleGraph}
              resetSignal={resetSignal}
              selectedNoteId={visualization.activeNoteId}
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
