import { ChevronRight } from "lucide-react";
import type { UiReferenceGraphView } from "../../../application/workspace/projection/viewGraph";
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
  graph: UiReferenceGraphView;
  onCollapseDetail?: () => void;
};

export function NoteReferenceGraphDetailPanel({
  graph,
  onCollapseDetail,
}: NoteReferenceGraphDetailPanelProps) {
  const hasIssues = graph.unresolvedReferences.length > 0;

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
