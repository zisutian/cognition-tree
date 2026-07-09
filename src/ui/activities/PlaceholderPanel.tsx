import {
  EmptyState,
  Panel,
} from "../shared/primitives";

export function PlaceholderPanel({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Panel className="placeholder-panel" aria-label={title}>
      <EmptyState description={description} title={title} />
    </Panel>
  );
}
