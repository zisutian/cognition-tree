import type { VisualizationViewModel } from "../../../../application/workspace/index.ts";
import {
  DetailPanel,
  PanelBody,
} from "../../../ui/index.ts";
import {
  AdjacentReferenceList,
  MostReferencedList,
} from "./VisualizationDetailLists.tsx";

export function VisualizationDetailPanel({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
  view: VisualizationViewModel;
}) {
  const visualization = view;
  const graph = visualization.graph;
  const activeNode = visualization.activeNoteId
    ? graph.nodes.find((node) => node.id === visualization.activeNoteId) ?? null
    : null;

  return (
    <DetailPanel
      aria-label="图谱详情"
      onCollapse={onCollapseDetail}
      title="图谱详情"
    >
      <PanelBody className="detail-panel-stack" scroll>
        <dl
          aria-label="图谱统计"
          className="detail-summary-strip"
        >
          <div>
            <dd>{graph.stats.nodeCount}</dd>
            <dt>点</dt>
          </div>
          <div>
            <dd>{graph.stats.edgeCount}</dd>
            <dt>边</dt>
          </div>
          <div>
            <dd>{graph.stats.isolatedCount}</dd>
            <dt>孤立</dt>
          </div>
        </dl>
        <div aria-hidden="true" className="detail-divider" />
        {activeNode ? (
          <div className="detail-primary-row">
            <p>{activeNode.title}</p>
            <dl className="detail-meta-line" aria-label="当前节点引用">
              <div>
                <dd>{activeNode.referencesIn}</dd>
                <dt>入链</dt>
              </div>
              <div>
                <dd>{activeNode.referencesOut}</dd>
                <dt>出链</dt>
              </div>
            </dl>
          </div>
        ) : (
          <p className="ui-muted">选择图中的笔记节点查看详情。</p>
        )}
        <div aria-hidden="true" className="detail-divider" />
        {activeNode ? (
          <AdjacentReferenceList activeNodeId={activeNode.id} graph={graph} />
        ) : (
          <p className="ui-muted">这个节点暂无引用关系。</p>
        )}
        <div aria-hidden="true" className="detail-divider" />
        <MostReferencedList
          graph={graph}
          onSelectNote={visualization.onSelectNote}
        />
      </PanelBody>
    </DetailPanel>
  );
}
