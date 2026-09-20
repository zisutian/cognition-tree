import { FileInput, FileOutput, Hash, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import type { UiReferenceGraphView } from "../../../../application/workspace/index.ts";
import {
  createClassNames,
  ListAction,
  Section,
  SymbolSlot,
} from "../../../ui/index.ts";
const cx = createClassNames();

type VisualizationGraph = UiReferenceGraphView;

function AdjacentReferenceGroup({
  icon: Icon,
  label,
  references,
}: {
  icon: LucideIcon;
  label: string;
  references: Array<{ id: string; title: string; count: number }>;
}) {
  if (references.length === 0) return null;
  return (
    <Section title={label}>
      <ul aria-label={label} className={cx("detail-line-list")}>
        {references.slice(0, 8).map((reference) => (
          <li key={reference.id}>
            <div className={cx("detail-line-row")}>
              <SymbolSlot
                aria-hidden="true"
                className={cx("detail-line-marker")}
                tone="muted"
              >
                <Icon aria-hidden="true" size={13} strokeWidth={2} />
              </SymbolSlot>
              <span className={cx("detail-line-main")} title={reference.title}>
                {reference.title}
              </span>
              <span className={cx("detail-line-meta")}>× {reference.count}</span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function AdjacentReferenceList({
  activeNodeId,
  graph,
}: {
  activeNodeId: string;
  graph: VisualizationGraph;
}) {
  const details = graph.detailsByNoteId.get(activeNodeId);
  const incomingEdges = details?.incomingEdges ?? [];
  const outgoingEdges = details?.outgoingEdges ?? [];
  const titleById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.title])),
    [graph.nodes],
  );

  return incomingEdges.length + outgoingEdges.length > 0 ? (
    <>
      <AdjacentReferenceGroup
        icon={FileInput}
        label="入链"
        references={incomingEdges.map((edge) => ({
          id: edge.id,
          title: titleById.get(edge.sourceNoteId) ?? edge.sourceNoteId,
          count: edge.count,
        }))}
      />
      <AdjacentReferenceGroup
        icon={FileOutput}
        label="出链"
        references={outgoingEdges.map((edge) => ({
          id: edge.id,
          title: edge.targetTitle,
          count: edge.count,
        }))}
      />
    </>
  ) : (
    <p className={cx("ui-muted")}>暂无引用</p>
  );
}

export function MostReferencedList({
  graph,
  onSelectNote,
}: {
  graph: VisualizationGraph;
  onSelectNote: (noteId: string) => void;
}) {
  return graph.mostReferencedNodes.length > 0 ? (
    <Section title="引用最多">
      <ul aria-label="引用排名" className={cx("detail-line-list")}>
        {graph.mostReferencedNodes.map((node) => (
          <li key={node.id}>
            <ListAction
              kind="detail"
              type="button"
              onClick={() => onSelectNote(node.id)}
            >
              <SymbolSlot
                aria-hidden="true"
                className={cx("detail-line-marker")}
                tone="muted"
              >
                <Hash aria-hidden="true" size={13} strokeWidth={2} />
              </SymbolSlot>
              <span className={cx("detail-line-main")}>{node.title}</span>
              <span className={cx("detail-line-meta")}>
                {node.totalReferences}
              </span>
            </ListAction>
          </li>
        ))}
      </ul>
    </Section>
  ) : null;
}
