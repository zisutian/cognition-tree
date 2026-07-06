import type { UiReferenceGraphView } from "../../../application/workspace/projection/viewGraph";

type NoteReferenceGraphDetailPanelProps = {
  graph: UiReferenceGraphView;
};

export function NoteReferenceGraphDetailPanel({
  graph,
}: NoteReferenceGraphDetailPanelProps) {
  const hasIssues = graph.unresolvedReferences.length > 0;

  return (
    <aside className="activity-detail-panel" aria-label="可视化详情">
      <header className="panel-header">
        <div>
          <h2>可视化</h2>
        </div>
      </header>

      <div className="activity-detail-body">
        <section className="activity-detail-section">
          <p className="activity-detail-title">引用量最多</p>
          {graph.mostReferencedNodes.length > 0 ? (
            <ol className="visualization-rank-list">
              {graph.mostReferencedNodes.map((node) => (
                <li key={node.id}>
                  <span>{node.title}</span>
                  <small>
                    入 {node.referencesIn} / 出 {node.referencesOut}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="activity-muted">暂无引用关系。</p>
          )}
        </section>

        {!hasIssues ? (
          <p className="activity-muted">没有需要处理的引用问题。</p>
        ) : null}

        {graph.unresolvedReferences.length > 0 ? (
          <section className="activity-detail-section">
            <p className="activity-detail-title">未匹配引用</p>
            <ul className="visualization-detail-list">
              {graph.unresolvedReferences.slice(0, 24).map((reference) => (
                <li key={`${reference.sourceNoteId}-${reference.targetText}`}>
                  <span>{reference.sourceTitle}</span>
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
