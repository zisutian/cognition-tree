import type { VisualizationViewModel } from "../../../../application/workspace/index.ts";
import { createClassNames, Page, PageBody } from "../../../ui/index.ts";
import {
  AdjacentReferenceList,
  MostReferencedList,
} from "./VisualizationDetailLists.tsx";
const cx = createClassNames();

export function VisualizationDetailPanel({
  view,
}: {
  view: VisualizationViewModel;
}) {
  const visualization = view;
  const graph = visualization.graph;
  const activeNode = visualization.activeNoteId
    ? (graph.nodes.find((node) => node.id === visualization.activeNoteId) ??
      null)
    : null;

  return (
    <Page aria-label="图谱详情">
      <PageBody scroll>
        <dl aria-label="图谱统计" className={cx("detail-summary-strip")}>
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
        <div aria-hidden="true" className={cx("detail-divider")} />
        {activeNode ? (
          <div className={cx("detail-primary-row")}>
            <p>{activeNode.title}</p>
            <dl className={cx("detail-meta-line")} aria-label="当前节点引用">
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
          <p className={cx("ui-muted")}>未选择笔记</p>
        )}
        {activeNode ? (
          <>
            <div aria-hidden="true" className={cx("detail-divider")} />
            <AdjacentReferenceList activeNodeId={activeNode.id} graph={graph} />
          </>
        ) : null}
        <div aria-hidden="true" className={cx("detail-divider")} />
        <MostReferencedList
          graph={graph}
          onSelectNote={visualization.onSelectNote}
        />
      </PageBody>
    </Page>
  );
}
