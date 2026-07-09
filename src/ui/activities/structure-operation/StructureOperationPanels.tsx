import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
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

export function StructureOperationMainPanel({ view }: { view: ViewModel }) {
  if (view.structureOperation.noteTree.length === 0) {
    return (
      <Panel className="structure-operation-panel" aria-label="结构操作">
        <EmptyState description="没有可操作笔记。" title="结构操作" />
      </Panel>
    );
  }

  return (
    <Panel className="structure-operation-panel" aria-label="结构操作">
      <PanelHeader title="结构操作" />
      <PanelBody className={cx("structure-operation-body", view.structureOperation.mode)}>
        {view.structureOperation.mode === "withinNote" ? (
          <StructureOperationStructureView view={view} />
        ) : (
          <StructureOperationPairView view={view} />
        )}
      </PanelBody>
    </Panel>
  );
}
