import type { NoteReferenceGraph } from "../../workspace/noteReferenceGraph";

type SidebarVisualizationSummaryProps = {
  graph: NoteReferenceGraph;
};

export function SidebarVisualizationSummary({
  graph,
}: SidebarVisualizationSummaryProps) {
  const isolatedCount = graph.nodes.filter((node) => node.isolated).length;
  const referencedNodes = [...graph.nodes]
    .filter((node) => node.referencesIn + node.referencesOut > 0)
    .sort(
      (left, right) =>
        right.referencesIn +
        right.referencesOut -
        (left.referencesIn + left.referencesOut),
    )
    .slice(0, 6);

  return (
    <div className="side-panel-body">
      <section className="side-section">
        <p className="side-section-title">图谱统计</p>
        <div className="side-metrics">
          <div className="side-metric">
            <span>点</span>
            <strong>{graph.nodes.length}</strong>
          </div>
          <div className="side-metric">
            <span>边</span>
            <strong>{graph.edges.length}</strong>
          </div>
          <div className="side-metric">
            <span>孤立</span>
            <strong>{isolatedCount}</strong>
          </div>
        </div>
      </section>

      <section className="side-section">
        <p className="side-section-title">引用较多</p>
        <div className="side-entry-list">
          {referencedNodes.length > 0 ? (
            referencedNodes.map((node) => (
              <button className="side-entry" disabled key={node.id} type="button">
                {node.title}
              </button>
            ))
          ) : (
            <p className="side-muted">暂无引用</p>
          )}
        </div>
      </section>
    </div>
  );
}
