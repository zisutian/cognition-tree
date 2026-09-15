import { FileInput, FileOutput, Hash } from "lucide-react";
import { useMemo } from "react";
import type { UiReferenceGraphView } from "../../../../application/workspace/index.ts";
import { createClassNames, ListAction, SymbolSlot } from "../../../ui/index.ts";
const cx = createClassNames();

type VisualizationGraph = UiReferenceGraphView;

export function AdjacentReferenceList({
  activeNodeId,
  graph,
}: {
  activeNodeId: string;
  graph: VisualizationGraph;
}) {
  const details = graph.detailsByNoteId.get(activeNodeId);
  const incomingEdges = details?.incomingEdges ?? [];
  const outgoingEdges = details?.outgoingEdges ?? [];
  const titleById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.title])),
    [graph.nodes],
  );

  return incomingEdges.length + outgoingEdges.length > 0 ? (
    <ul aria-label="邻接关系" className={cx("detail-line-list")}>
      {incomingEdges.slice(0, 8).map((edge) => (
        <li key={`in-${edge.id}`}>
          <div className={cx("detail-line-row")}>
            <SymbolSlot
              aria-hidden="true"
              className={cx("detail-line-marker")}
              tone="muted"
            >
              <FileInput aria-hidden="true" size={13} strokeWidth={2} />
            </SymbolSlot>
            <span className={cx("detail-line-main")}>
              {titleById.get(edge.sourceNoteId) ?? edge.sourceNoteId}
            </span>
            <span className={cx("detail-line-meta")}>× {edge.count}</span>
          </div>
        </li>
      ))}
      {outgoingEdges.slice(0, 8).map((edge) => (
        <li key={`out-${edge.id}`}>
          <div className={cx("detail-line-row")}>
            <SymbolSlot
              aria-hidden="true"
              className={cx("detail-line-marker")}
              tone="muted"
            >
              <FileOutput aria-hidden="true" size={13} strokeWidth={2} />
            </SymbolSlot>
            <span className={cx("detail-line-main")}>{edge.targetTitle}</span>
            <span className={cx("detail-line-meta")}>× {edge.count}</span>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className={cx("ui-muted")}>这个节点暂无引用关系。</p>
  );
}

export function MostReferencedList({
  graph,
  onSelectNote,
}: {
  graph: VisualizationGraph;
  onSelectNote: (noteId: string) => void;
}) {
  return graph.mostReferencedNodes.length > 0 ? (
    <ul aria-label="引用排名" className={cx("detail-line-list")}>
      {graph.mostReferencedNodes.map((node) => (
        <li key={node.id}>
          <ListAction
            kind="detail"
            type="button"
            onClick={() => onSelectNote(node.id)}
          >
            <SymbolSlot
              aria-hidden="true"
              className={cx("detail-line-marker")}
              tone="muted"
            >
              <Hash aria-hidden="true" size={13} strokeWidth={2} />
            </SymbolSlot>
            <span className={cx("detail-line-main")}>{node.title}</span>
            <span className={cx("detail-line-meta")}>
              {node.totalReferences}
            </span>
          </ListAction>
        </li>
      ))}
    </ul>
  ) : (
    <p className={cx("ui-muted")}>暂无引用关系。</p>
  );
}
