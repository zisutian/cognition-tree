import type { VisualizationViewModel } from "../../../../application/workspace/index.ts";
import { EmptyState, PropertyList, PropertyRow, Section } from "compact-ui";
import { Page, PageBody } from "../../../ui/index.ts";
import {
  AdjacentReferenceList,
  MostReferencedList,
} from "./VisualizationDetailLists.tsx";

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
        <section aria-label="图谱统计">
          <PropertyList>
            <PropertyRow label="笔记">{graph.stats.nodeCount}</PropertyRow>
            <PropertyRow label="关系">{graph.stats.edgeCount}</PropertyRow>
            <PropertyRow label="孤立">{graph.stats.isolatedCount}</PropertyRow>
          </PropertyList>
        </section>
        {activeNode ? (
          <Section title={activeNode.title}>
            <section aria-label="当前节点引用">
              <PropertyList>
                <PropertyRow label="入链">
                  {activeNode.referencesIn}
                </PropertyRow>
                <PropertyRow label="出链">
                  {activeNode.referencesOut}
                </PropertyRow>
              </PropertyList>
            </section>
          </Section>
        ) : (
          <EmptyState title="未选择笔记" />
        )}
        {activeNode ? (
          <AdjacentReferenceList activeNodeId={activeNode.id} graph={graph} />
        ) : null}
        <MostReferencedList
          graph={graph}
          onSelectNote={visualization.onSelectNote}
        />
      </PageBody>
    </Page>
  );
}
