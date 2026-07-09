import { ChevronRight } from "lucide-react";
import type { UiVisualizationViewModel } from "../../../application/workspace/projection/viewGraph";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../shared/primitives";
import {
  AdjacentReferenceList,
  MostReferencedList,
  UnresolvedReferenceList,
} from "./VisualizationDetailLists";

export function VisualizationDetailPanel({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
  view: ViewModel;
}) {
  const visualization: UiVisualizationViewModel = view.visualization;
  const graph = visualization.graph;
  const activeNode = visualization.activeNoteId
    ? graph.nodes.find((node) => node.id === visualization.activeNoteId) ?? null
    : null;

  return (
    <Panel aria-label="图谱详情" as="aside" tone="detail">
      <PanelHeader
        title="图谱详情"
        actions={
          <Button
            aria-label="收回右侧详情"
            onClick={onCollapseDetail}
            title="收回右侧详情"
            type="button"
            variant="icon"
          >
            <ChevronRight aria-hidden="true" size={14} />
          </Button>
        }
      />
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
        <div aria-hidden="true" className="detail-divider" />
        <UnresolvedReferenceList graph={graph} />
      </PanelBody>
    </Panel>
  );
}
