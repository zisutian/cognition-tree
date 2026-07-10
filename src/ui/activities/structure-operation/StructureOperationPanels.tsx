import type { StructureOperationActivityViewModel } from "../../../application/workspace/view-model/activityViewModels";
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  cx,
} from "../../shared/primitives";
import { StructureOperationContext } from "./StructureOperationContext";
import { StructureOperationPairView } from "./StructureOperationPairView";
import { StructureOperationStructureView } from "./StructureOperationStructureView";

export { StructureOperationContext };

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
