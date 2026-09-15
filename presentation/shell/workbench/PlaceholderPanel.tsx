import { EmptyState, Page } from "../../ui/index.ts";

export function PlaceholderPanel({ title }: { title: string }) {
  return (
    <Page kind="empty" aria-label={title}>
      <EmptyState title={title} />
    </Page>
  );
}
