import {
  EmptyState,
  Panel,
} from "../../ui/index.ts";

export function PlaceholderPanel({
  title,
}: {
  title: string;
}) {
  return (
    <Panel className="placeholder-panel" aria-label={title}>
      <EmptyState title={title} />
    </Panel>
  );
}
