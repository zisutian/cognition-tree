import { EmptyState } from "compact-ui";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import { Page, PageBody } from "../../../ui/index.ts";
import { StructureOperationPairView } from "./StructureOperationPairView.tsx";
import { StructureOperationStructureView } from "./StructureOperationStructureView.tsx";

export function StructureOperationMainPanel({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  if (view.noteTree.length === 0) {
    return (
      <Page aria-label="结构操作">
        <EmptyState title="没有可操作笔记" />
      </Page>
    );
  }

  return (
    <Page aria-label="结构操作">
      <PageBody scroll={false}>
        {view.mode === "withinNote" ? (
          <StructureOperationStructureView view={view} />
        ) : (
          <StructureOperationPairView view={view} />
        )}
      </PageBody>
    </Page>
  );
}
