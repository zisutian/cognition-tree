import {
  FileInput,
  FileOutput,
  Hash,
} from "lucide-react";
import type { UiReferenceGraphView } from "../../../application/workspace/projection/viewGraph";
import { SymbolSlot } from "../../shared/primitives";

type VisualizationGraph = UiReferenceGraphView;

export function AdjacentReferenceList({
  activeNodeId,
  graph,
}: {
  activeNodeId: string;
  graph: VisualizationGraph;
}) {
  const incomingEdges = graph.edges.filter((edge) => edge.targetNoteId === activeNodeId);
  const outgoingEdges = graph.edges.filter((edge) => edge.sourceNoteId === activeNodeId);
  const titleById = new Map(graph.nodes.map((node) => [node.id, node.title]));

  return incomingEdges.length + outgoingEdges.length > 0 ? (
    <ul aria-label="邻接关系" className="detail-line-list">
      {incomingEdges.slice(0, 8).map((edge) => (
        <li key={`in-${edge.id}`}>
          <div className="detail-line-row">
            <SymbolSlot
              aria-hidden="true"
              className="detail-line-marker"
              tone="muted"
            >
              <FileInput aria-hidden="true" size={13} strokeWidth={2} />
            </SymbolSlot>
            <span className="detail-line-main">
              {titleById.get(edge.sourceNoteId) ?? edge.sourceNoteId}
            </span>
            <span className="detail-line-meta">× {edge.count}</span>
          </div>
        </li>
      ))}
      {outgoingEdges.slice(0, 8).map((edge) => (
        <li key={`out-${edge.id}`}>
          <div className="detail-line-row">
            <SymbolSlot
              aria-hidden="true"
              className="detail-line-marker"
              tone="muted"
            >
              <FileOutput aria-hidden="true" size={13} strokeWidth={2} />
            </SymbolSlot>
            <span className="detail-line-main">{edge.targetTitle}</span>
            <span className="detail-line-meta">× {edge.count}</span>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="ui-muted">这个节点暂无引用关系。</p>
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
    <ul aria-label="引用排名" className="detail-line-list">
      {graph.mostReferencedNodes.map((node) => (
        <li key={node.id}>
          <button
            className="detail-line-row detail-line-button"
            type="button"
            onClick={() => onSelectNote(node.id)}
          >
            <SymbolSlot
              aria-hidden="true"
              className="detail-line-marker"
              tone="muted"
            >
              <Hash aria-hidden="true" size={13} strokeWidth={2} />
            </SymbolSlot>
            <span className="detail-line-main">{node.title}</span>
            <span className="detail-line-meta">{node.totalReferences}</span>
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="ui-muted">暂无引用关系。</p>
  );
}
