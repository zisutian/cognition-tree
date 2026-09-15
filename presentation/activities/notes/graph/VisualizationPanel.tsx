import { useMemo } from "react";
import type { VisualizationViewModel } from "../../../../application/workspace/index.ts";
import {
  createClassNames,
  EmptyState,
  Page,
  PageBody,
} from "../../../ui/index.ts";
import { ReferenceGraphCanvas } from "./ReferenceGraphCanvas.tsx";
import graphStyles from "./graph.module.css";
import { getEmptyGraphMessage } from "./graphEmptyState.ts";
import { createVisibleReferenceGraph } from "./referenceGraphView.ts";
import type { ReferenceGraphSession } from "./useReferenceGraphSession.ts";
const cx = createClassNames(graphStyles);

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
  const topologyVariant = `${
    mode === "local" ? (visualization.activeNoteId ?? "none") : "global"
  }:${mode}:${localDepth}:${hideIsolated ? 1 : 0}:${query}`;
  const emptyMessage = getEmptyGraphMessage({
    graphNodeCount: visualization.graph.nodes.length,
    hasActiveNote: Boolean(visualization.activeNoteId),
    hideIsolated,
    mode,
    query,
  });

  return (
    <Page aria-label="引用图谱">
      <PageBody scroll={false}>
        <div className={cx("graph-canvas")}>
          {visibleGraph.nodes.length > 0 ? (
            <ReferenceGraphCanvas
              controller={session.getController(
                visualization.graph.topologyIdentity,
                topologyVariant,
              )}
              displaySettings={session.settings.display}
              forceSettings={session.settings.forces}
              graph={visibleGraph}
              resetSignal={session.resetSignal}
              selectedNoteId={visualization.activeNoteId}
              onSelectNote={visualization.onSelectNote}
            />
          ) : (
            <EmptyState title={emptyMessage.title} />
          )}
        </div>
      </PageBody>
    </Page>
  );
}
