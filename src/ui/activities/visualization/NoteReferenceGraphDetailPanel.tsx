import { ChevronRight } from "lucide-react";
import type { UiVisualizationViewModel } from "../../../application/workspace/projection/viewGraph";
import {
  UiButton,
  UiList,
  UiListRow,
  UiMetrics,
  UiPanel,
  UiPanelBody,
  UiPanelHeader,
  UiSection,
  UiSectionTitle,
} from "../../shared/primitives";

type NoteReferenceGraphDetailPanelProps = {
  visualization: UiVisualizationViewModel;
  onCollapseDetail?: () => void;
};

export function NoteReferenceGraphDetailPanel({
  visualization,
  onCollapseDetail,
}: NoteReferenceGraphDetailPanelProps) {
  const graph = visualization.graph;
  const hasIssues = graph.unresolvedReferences.length > 0;
  const selectedNode = visualization.activeNoteId
    ? graph.nodes.find((node) => node.id === visualization.activeNoteId) ?? null
    : null;
  const selectedIncomingEdges = selectedNode
    ? graph.edges.filter((edge) => edge.targetNoteId === selectedNode.id)
    : [];
  const selectedOutgoingEdges = selectedNode
    ? graph.edges.filter((edge) => edge.sourceNoteId === selectedNode.id)
    : [];
  const titleById = new Map(graph.nodes.map((node) => [node.id, node.title]));

  return (
    <UiPanel as="aside" aria-label="可视化详情" variant="detail">
      <UiPanelHeader
        leadingActions={
          onCollapseDetail ? (
            <UiButton
              aria-label="收回右侧栏"
              className="detail-header-collapse-button"
              onClick={onCollapseDetail}
              title="收回右侧栏"
              type="button"
              variant="icon"
            >
              <ChevronRight aria-hidden="true" size={15} strokeWidth={2} />
            </UiButton>
          ) : null
        }
        title="可视化"
      />

      <UiPanelBody>
        <UiMetrics
          aria-label="图谱统计"
          items={[
            { label: "点", value: graph.stats.nodeCount },
            { label: "边", value: graph.stats.edgeCount },
            { label: "孤立", value: graph.stats.isolatedCount },
          ]}
        />

        <UiSection>
          <UiSectionTitle>当前节点</UiSectionTitle>
          {selectedNode ? (
            <div className="visualization-node-summary">
              <strong>{selectedNode.title}</strong>
              <UiMetrics
                aria-label="当前节点统计"
                items={[
                  { label: "入链", value: selectedNode.referencesIn },
                  { label: "出链", value: selectedNode.referencesOut },
                ]}
              />
              {selectedIncomingEdges.length + selectedOutgoingEdges.length > 0 ? (
                <UiList scroll variant="cards">
                  {selectedIncomingEdges.slice(0, 8).map((edge) => (
                    <UiListRow
                      className="visualization-neighbor-row"
                      key={`in-${edge.id}`}
                    >
                      <span>{titleById.get(edge.sourceNoteId) ?? edge.sourceNoteId}</span>
                      <small>引用此笔记 ×{edge.count}</small>
                    </UiListRow>
                  ))}
                  {selectedOutgoingEdges.slice(0, 8).map((edge) => (
                    <UiListRow
                      className="visualization-neighbor-row"
                      key={`out-${edge.id}`}
                    >
                      <span>{edge.targetTitle}</span>
                      <small>被此笔记引用 ×{edge.count}</small>
                    </UiListRow>
                  ))}
                </UiList>
              ) : (
                <p className="ui-muted">这个节点暂无引用关系。</p>
              )}
            </div>
          ) : (
            <p className="ui-muted">点击图中的笔记节点查看详情。</p>
          )}
        </UiSection>

        <UiSection>
          <UiSectionTitle>引用量最多</UiSectionTitle>
          {graph.mostReferencedNodes.length > 0 ? (
            <UiList as="ol" scroll variant="cards">
              {graph.mostReferencedNodes.map((node) => (
                <UiListRow className="visualization-rank-row" key={node.id}>
                  <span>{node.title}</span>
                  <small>
                    入 {node.referencesIn} / 出 {node.referencesOut}
                  </small>
                </UiListRow>
              ))}
            </UiList>
          ) : (
            <p className="ui-muted">暂无引用关系。</p>
          )}
        </UiSection>

        {!hasIssues ? (
          <p className="ui-muted">没有需要处理的引用问题。</p>
        ) : null}

        {graph.unresolvedReferences.length > 0 ? (
          <UiSection>
            <UiSectionTitle>未匹配引用</UiSectionTitle>
            <UiList scroll variant="cards">
              {graph.unresolvedReferences.slice(0, 24).map((reference) => (
                <UiListRow
                  className="visualization-detail-row"
                  key={`${reference.sourceNoteId}-${reference.targetText}`}
                >
                  <span>{reference.sourceTitle}</span>
                  <strong>?</strong>
                  <span>{reference.targetText}</span>
                  {reference.count > 1 ? <small>×{reference.count}</small> : null}
                </UiListRow>
              ))}
            </UiList>
          </UiSection>
        ) : null}

      </UiPanelBody>
    </UiPanel>
  );
}
