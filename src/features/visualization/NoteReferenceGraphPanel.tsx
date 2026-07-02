import { useMemo } from "react";
import type {
  NoteReferenceGraph,
  NoteReferenceGraphNode,
} from "../../workspace/noteReferenceGraph";

type NoteReferenceGraphPanelProps = {
  graph: NoteReferenceGraph;
};

type PositionedNode = NoteReferenceGraphNode & {
  x: number;
  y: number;
};

const viewBoxWidth = 920;
const viewBoxHeight = 560;
const graphCenterX = viewBoxWidth / 2;
const graphCenterY = viewBoxHeight / 2;

function createNodePositions(nodes: NoteReferenceGraphNode[]) {
  if (nodes.length === 0) {
    return new Map<string, PositionedNode>();
  }

  if (nodes.length === 1) {
    return new Map([
      [
        nodes[0].id,
        {
          ...nodes[0],
          x: graphCenterX,
          y: graphCenterY,
        },
      ],
    ]);
  }

  const radius = Math.min(230, Math.max(110, nodes.length * 14));
  const positionedNodes = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;

    return {
      ...node,
      x: graphCenterX + Math.cos(angle) * radius,
      y: graphCenterY + Math.sin(angle) * radius,
    };
  });

  return new Map(positionedNodes.map((node) => [node.id, node]));
}

function getNodeRadius(node: NoteReferenceGraphNode) {
  return Math.min(18, 7 + node.referencesIn + node.referencesOut);
}

function truncateTitle(title: string) {
  return title.length > 16 ? `${title.slice(0, 15)}…` : title;
}

export function NoteReferenceGraphPanel({
  graph,
}: NoteReferenceGraphPanelProps) {
  const positionedNodes = useMemo(
    () => createNodePositions(graph.nodes),
    [graph.nodes],
  );
  const isolatedCount = graph.nodes.filter((node) => node.isolated).length;

  return (
    <section className="workspace-main-panel visualization-workspace-panel" aria-label="可视化">
      <header className="panel-header">
        <div>
          <h2>笔记引用图谱</h2>
        </div>
        <div className="stats">
          <span>{graph.nodes.length} 点</span>
          <span>{graph.edges.length} 边</span>
          <span>{isolatedCount} 孤立</span>
        </div>
      </header>

      <div className="visualization-graph-surface">
        {graph.nodes.length > 0 ? (
          <svg
            className="note-reference-graph"
            role="img"
            viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          >
            <title>笔记引用图谱</title>
            <g className="note-reference-edges">
              {graph.edges.map((edge) => {
                const sourceNode = positionedNodes.get(edge.sourceNoteId);
                const targetNode = positionedNodes.get(edge.targetNoteId);

                if (!sourceNode || !targetNode) {
                  return null;
                }

                if (sourceNode.id === targetNode.id) {
                  return (
                    <path
                      className="note-reference-edge self-edge"
                      d={`M ${sourceNode.x} ${sourceNode.y - 18} C ${sourceNode.x + 42} ${sourceNode.y - 58}, ${sourceNode.x + 58} ${sourceNode.y + 18}, ${sourceNode.x + 10} ${sourceNode.y + 14}`}
                      key={edge.id}
                    />
                  );
                }

                return (
                  <line
                    className="note-reference-edge"
                    key={edge.id}
                    x1={sourceNode.x}
                    x2={targetNode.x}
                    y1={sourceNode.y}
                    y2={targetNode.y}
                  />
                );
              })}
            </g>
            <g className="note-reference-nodes">
              {graph.nodes.map((node) => {
                const positionedNode = positionedNodes.get(node.id);

                if (!positionedNode) {
                  return null;
                }

                return (
                  <g
                    className={
                      node.isolated
                        ? "note-reference-node is-isolated"
                        : "note-reference-node"
                    }
                    key={node.id}
                    transform={`translate(${positionedNode.x}, ${positionedNode.y})`}
                  >
                    <circle r={getNodeRadius(node)} />
                    <text x="0" y="28">
                      {truncateTitle(node.title)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        ) : (
          <div className="visualization-empty-state">
            <h3>没有笔记</h3>
            <p>创建笔记后会在这里显示点状引用图谱。</p>
          </div>
        )}
      </div>
    </section>
  );
}
