import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  cx,
} from "../../../ui/index.ts";
import { StructureOperationPairView } from "./StructureOperationPairView.tsx";
import { StructureOperationStructureView } from "./StructureOperationStructureView.tsx";

export function StructureOperationMainPanel({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  if (view.noteTree.length === 0) {
    return (
      <Panel className="structure-operation-panel" aria-label="结构操作">
        <EmptyState description="没有可操作笔记。" title="结构操作" />
      </Panel>
    );
  }

  return (
    <Panel className="structure-operation-panel" aria-label="结构操作">
      <PanelHeader title="结构操作" />
      <PanelBody className={cx("structure-operation-body", view.mode)}>
        {view.mode === "withinNote" ? (
          <StructureOperationStructureView view={view} />
        ) : (
          <StructureOperationPairView view={view} />
        )}
      </PanelBody>
    </Panel>
  );
}
