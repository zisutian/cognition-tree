import type { NoteReferenceGraph } from "../../workspace/view-model/noteReferenceGraph";

type NoteReferenceGraphDetailPanelProps = {
  graph: NoteReferenceGraph;
};

function getNodeTitle(graph: NoteReferenceGraph, noteId: string) {
  return graph.nodes.find((node) => node.id === noteId)?.title ?? noteId;
}

export function NoteReferenceGraphDetailPanel({
  graph,
}: NoteReferenceGraphDetailPanelProps) {
  const hasIssues = graph.unresolvedReferences.length > 0;
  const mostReferencedNodes = [...graph.nodes]
    .map((node) => ({
      ...node,
      totalReferences: node.referencesIn + node.referencesOut,
    }))
    .filter((node) => node.totalReferences > 0)
    .sort((left, right) => right.totalReferences - left.totalReferences)
    .slice(0, 8);

  return (
    <aside className="workspace-detail-panel" aria-label="可视化详情">
      <header className="panel-header">
        <div>
          <h2>可视化</h2>
        </div>
      </header>

      <div className="workspace-detail-body">
        <section className="workspace-detail-section">
          <p className="workspace-detail-title">引用量最多</p>
          {mostReferencedNodes.length > 0 ? (
            <ol className="visualization-rank-list">
              {mostReferencedNodes.map((node) => (
                <li key={node.id}>
                  <span>{node.title}</span>
                  <small>
                    入 {node.referencesIn} / 出 {node.referencesOut}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="workspace-muted">暂无引用关系。</p>
          )}
        </section>

        {!hasIssues ? (
          <p className="workspace-muted">没有需要处理的引用问题。</p>
        ) : null}

        {graph.unresolvedReferences.length > 0 ? (
          <section className="workspace-detail-section">
            <p className="workspace-detail-title">未匹配引用</p>
            <ul className="visualization-detail-list">
              {graph.unresolvedReferences.slice(0, 24).map((reference) => (
                <li key={`${reference.sourceNoteId}-${reference.targetText}`}>
                  <span>{getNodeTitle(graph, reference.sourceNoteId)}</span>
                  <strong>?</strong>
                  <span>{reference.targetText}</span>
                  {reference.count > 1 ? <small>×{reference.count}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

      </div>
    </aside>
  );
}
