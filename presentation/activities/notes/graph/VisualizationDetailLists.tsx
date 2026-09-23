import {
  List,
  ListRow,
  Section,
  StatusText,
} from "compact-ui";
import { Hash } from "lucide-react";
import { useMemo } from "react";
import type { UiReferenceGraphView } from "../../../../application/workspace/index.ts";

type VisualizationGraph = UiReferenceGraphView;

function AdjacentReferenceGroup({
  label,
  references,
}: {
  label: string;
  references: Array<{ id: string; title: string; count: number }>;
}) {
  if (references.length === 0) return null;
  return (
    <Section title={label}>
      <List aria-label={label}>
        {references.slice(0, 8).map((reference) => (
          <ListRow
            key={reference.id}
            layout="detailed"
            title={reference.title}
            description={`× ${reference.count}`}
          />
        ))}
      </List>
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
        label="入链"
        references={incomingEdges.map((edge) => ({
          id: edge.id,
          title: titleById.get(edge.sourceNoteId) ?? edge.sourceNoteId,
          count: edge.count,
        }))}
      />
      <AdjacentReferenceGroup
        label="出链"
        references={outgoingEdges.map((edge) => ({
          id: edge.id,
          title: edge.targetTitle,
          count: edge.count,
        }))}
      />
    </>
  ) : null;
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
      <List aria-label="引用排名">
        {graph.mostReferencedNodes.map((node) => (
          <ListRow
            key={node.id}
            layout="compact"
            icon={<Hash aria-hidden="true" />}
            onSelect={() => onSelectNote(node.id)}
            title={<>{node.title} <StatusText>{node.totalReferences}</StatusText></>}
          />
        ))}
      </List>
    </Section>
  ) : null;
}
