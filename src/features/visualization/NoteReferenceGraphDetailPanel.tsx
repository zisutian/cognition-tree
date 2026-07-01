import type { NoteWorkspace } from "../../domain/notes";
import type { NoteReferenceGraph } from "../../workspace/noteReferenceGraph";

type NoteReferenceGraphDetailPanelProps = {
  graph: NoteReferenceGraph;
  workspace: NoteWorkspace;
};

function getNoteTitle(workspace: NoteWorkspace, noteId: string) {
  return workspace.notes.find((note) => note.id === noteId)?.title ?? noteId;
}

export function NoteReferenceGraphDetailPanel({
  graph,
  workspace,
}: NoteReferenceGraphDetailPanelProps) {
  const isolatedCount = graph.nodes.filter((node) => node.isolated).length;

  return (
    <aside className="workspace-detail-panel" aria-label="可视化详情">
      <header className="panel-header compact">
        <div>
          <p className="eyebrow">Graph</p>
          <h2>可视化</h2>
        </div>
      </header>

      <div className="workspace-detail-body">
        <section className="workspace-detail-section">
          <p className="workspace-detail-title">统计</p>
          <dl className="workspace-definition-list">
            <div>
              <dt>节点</dt>
              <dd>{graph.nodes.length}</dd>
            </div>
            <div>
              <dt>引用边</dt>
              <dd>{graph.edges.length}</dd>
            </div>
            <div>
              <dt>孤立点</dt>
              <dd>{isolatedCount}</dd>
            </div>
          </dl>
        </section>

        <section className="workspace-detail-section">
          <p className="workspace-detail-title">引用关系</p>
          {graph.edges.length > 0 ? (
            <ul className="visualization-detail-list">
              {graph.edges.slice(0, 32).map((edge) => (
                <li key={edge.id}>
                  <span>{getNoteTitle(workspace, edge.sourceNoteId)}</span>
                  <strong>→</strong>
                  <span>{getNoteTitle(workspace, edge.targetNoteId)}</span>
                  {edge.count > 1 ? <small>×{edge.count}</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="workspace-muted">暂无笔记间引用。</p>
          )}
        </section>

        {graph.unresolvedReferences.length > 0 ? (
          <section className="workspace-detail-section">
            <p className="workspace-detail-title">未匹配引用</p>
            <ul className="visualization-detail-list">
              {graph.unresolvedReferences.slice(0, 24).map((reference) => (
                <li key={`${reference.sourceNoteId}-${reference.targetText}`}>
                  <span>{getNoteTitle(workspace, reference.sourceNoteId)}</span>
                  <strong>?</strong>
                  <span>{reference.targetText}</span>
                  {reference.count > 1 ? <small>×{reference.count}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {graph.issues.length > 0 ? (
          <section className="workspace-detail-section">
            <p className="workspace-detail-title">解析问题</p>
            <ul className="workspace-diagnostic-list">
              {graph.issues.map((issue) => (
                <li key={issue.noteId}>
                  <span>{getNoteTitle(workspace, issue.noteId)}</span>
                  <p>{issue.message}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
